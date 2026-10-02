import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const BASE = "https://edge.test";
const FP = "a".repeat(64);
const DOC = JSON.stringify({ schema_version: "1", key: { tonic: "C", mode: "major" } });

const call = (path: string, init?: RequestInit) => exports.default.fetch(`${BASE}${path}`, init);

function put(doc: string, install: string, ip: string, fp = FP) {
  return call(`/cache/${fp}?engine=0.1.0&sep=hpss`, {
    method: "PUT",
    body: doc,
    headers: { "Content-Type": "application/json", "X-Isai-Install": install, "CF-Connecting-IP": ip },
  });
}

describe("edge worker", () => {
  it("reports health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, env: "dev" });
  });

  it("serves a cached document only after two independent submitters agree", async () => {
    const get = () => call(`/cache/${FP}?engine=0.1.0&sep=hpss`);

    expect((await put(DOC, crypto.randomUUID(), "198.51.100.1")).status).toBe(202);
    expect((await get()).status).toBe(404);

    // Same network again does not count as independent confirmation
    expect((await put(DOC, crypto.randomUUID(), "198.51.100.1")).status).toBe(202);
    expect((await get()).status).toBe(404);

    expect((await put(DOC, crypto.randomUUID(), "203.0.113.7")).status).toBe(202);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(DOC);
  });

  it("serves the majority document when submissions disagree", async () => {
    const fp = "b".repeat(64);
    const fake = JSON.stringify({ schema_version: "1", key: { tonic: "F#", mode: "minor" } });
    await put(fake, crypto.randomUUID(), "192.0.2.1", fp);
    await put(fake, crypto.randomUUID(), "192.0.2.2", fp);
    for (const ip of ["198.51.100.10", "198.51.100.11", "198.51.100.12"]) {
      await put(DOC, crypto.randomUUID(), ip, fp);
    }
    const res = await call(`/cache/${fp}?engine=0.1.0&sep=hpss`);
    expect(await res.text()).toBe(DOC);
  });

  it("rejects writes without a valid install id or with bad input", async () => {
    expect((await put(DOC, "not-a-uuid", "198.51.100.1")).status).toBe(400);
    expect((await put("{oops", crypto.randomUUID(), "198.51.100.1")).status).toBe(400);
    expect((await put(DOC, crypto.randomUUID(), "198.51.100.1", "XYZ")).status).toBe(400);
  });

  it("rate-limits writes per install", async () => {
    const install = crypto.randomUUID();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await put(DOC, install, "198.51.100.99")).status);
    expect(statuses.slice(0, 10).every((s) => s === 202)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("serves versioned models from R2 as immutable with CORS", async () => {
    await env.MODELS.put("models/beat-this/0.1.0/model.onnx", new Uint8Array([1, 2, 3]));
    const res = await call("/models/beat-this/0.1.0/model.onnx");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect((await call("/models/../secrets")).status).toBe(404);
  });

  it("keeps the Teacher disabled until Phase 2", async () => {
    const res = await call("/teach", { method: "POST", headers: { "X-Isai-Install": crypto.randomUUID() } });
    expect(res.status).toBe(501);
  });
});
