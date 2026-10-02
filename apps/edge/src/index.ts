// Isai edge Worker (ADR-021). Receives JSON only — there is no route that accepts audio (ADR-013).

const SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEPARATIONS = new Set(["none", "hpss", "demucs"]);
const MAX_DOC_BYTES = 256 * 1024;
const MIN_INDEPENDENT_SUBMITTERS = 2;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Isai-Install",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...headers },
  });
}

const error = (status: number, message: string) => json({ error: message }, status);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Validates the X-Isai-Install header and applies the per-install write limit. */
async function admitWrite(request: Request, env: Env): Promise<string | Response> {
  const install = request.headers.get("X-Isai-Install") ?? "";
  if (!INSTALL_ID.test(install)) return error(400, "X-Isai-Install must be a UUID");
  const { success } = await env.WRITE_LIMITER.limit({ key: install });
  return success ? install : error(429, "Too many requests from this install; retry in a minute");
}

/** GET /models/:name/:version/:file and GET /models/manifest.json — served from R2. */
async function getModel(parts: string[], env: Env): Promise<Response> {
  const isManifest = parts.length === 1 && parts[0] === "manifest.json";
  if (!isManifest && (parts.length !== 3 || !parts.every((p) => SEGMENT.test(p)))) {
    return error(404, "Unknown model path");
  }
  const object = await env.MODELS.get(`models/${parts.join("/")}`);
  if (!object) return error(404, "Model not found");
  const headers = new Headers(CORS);
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  // Versioned model files never change; the manifest is the only mutable object.
  headers.set("Cache-Control", isManifest ? "public, max-age=300" : "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

function cacheKey(url: URL, fingerprint: string) {
  const engine = url.searchParams.get("engine") ?? "";
  const separation = url.searchParams.get("sep") ?? "";
  if (!FINGERPRINT.test(fingerprint)) return "fingerprint must be 64 lowercase hex characters";
  if (!SEGMENT.test(engine)) return "query parameter engine is required";
  if (!SEPARATIONS.has(separation)) return "query parameter sep must be none, hpss or demucs";
  return { fingerprint, engine, separation };
}

/** GET /cache/:fingerprint?engine=&sep= — the document most independent installs agree on. */
async function getCached(url: URL, fingerprint: string, env: Env): Promise<Response> {
  const key = cacheKey(url, fingerprint);
  if (typeof key === "string") return error(400, key);
  const row = await env.DB.prepare(
    `SELECT d.doc AS doc, COUNT(DISTINCT s.ip_hash) AS votes
       FROM submissions s JOIN documents d ON d.doc_hash = s.doc_hash
      WHERE s.fingerprint = ?1 AND s.engine_version = ?2 AND s.separation = ?3
      GROUP BY s.doc_hash
     HAVING votes >= ?4
      ORDER BY votes DESC
      LIMIT 1`,
  )
    .bind(key.fingerprint, key.engine, key.separation, MIN_INDEPENDENT_SUBMITTERS)
    .first<{ doc: string; votes: number }>();
  if (!row) return error(404, "Not cached");
  return new Response(row.doc, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", ...CORS },
  });
}

/** PUT /cache/:fingerprint?engine=&sep= — records a submission; it is served once independently confirmed. */
async function putCached(request: Request, url: URL, fingerprint: string, env: Env): Promise<Response> {
  if (!env.IP_SALT) return error(503, "Cache writes are disabled: IP_SALT secret is not set");
  const admitted = await admitWrite(request, env);
  if (admitted instanceof Response) return admitted;
  const key = cacheKey(url, fingerprint);
  if (typeof key === "string") return error(400, key);

  const text = await request.text();
  if (text.length > MAX_DOC_BYTES) return error(413, "Analysis document exceeds 256 KB");
  try {
    JSON.parse(text);
  } catch {
    return error(400, "Body must be the AnalysisDocument as JSON");
  }

  const now = Date.now();
  const docHash = await sha256Hex(text);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await sha256Hex(`${env.IP_SALT}:${ip}`);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO documents (doc_hash, doc, bytes, created_at) VALUES (?1, ?2, ?3, ?4)",
    ).bind(docHash, text, text.length, now),
    env.DB.prepare(
      `INSERT INTO submissions (fingerprint, engine_version, separation, install_id, ip_hash, doc_hash, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (fingerprint, engine_version, separation, install_id)
       DO UPDATE SET doc_hash = excluded.doc_hash, ip_hash = excluded.ip_hash, created_at = excluded.created_at`,
    ).bind(key.fingerprint, key.engine, key.separation, admitted, ipHash, docHash, now),
  ]);
  return json({ accepted: true, doc_hash: docHash }, 202);
}

/** POST /teach — the Teacher provider chain arrives in Phase 2 (ADR-019). */
async function teach(request: Request, env: Env): Promise<Response> {
  const admitted = await admitWrite(request, env);
  if (admitted instanceof Response) return admitted;
  return error(501, "The Teacher is not enabled yet (Phase 2)");
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const [route, ...rest] = url.pathname.split("/").filter(Boolean);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (route === "health" && request.method === "GET") {
      return json({ ok: true, env: env.ISAI_ENV });
    }
    if (route === "models" && request.method === "GET") return getModel(rest, env);
    if (route === "cache" && rest.length === 1) {
      if (request.method === "GET") return getCached(url, rest[0]!, env);
      if (request.method === "PUT") return putCached(request, url, rest[0]!, env);
    }
    if (route === "teach" && request.method === "POST") return teach(request, env);

    return error(404, "Not found");
  },
} satisfies ExportedHandler<Env>;
