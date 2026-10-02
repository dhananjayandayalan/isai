-- Shared analysis cache (ADR-021). No audio is ever stored (ADR-013).

-- Content-addressed analysis documents, deduplicated by hash.
CREATE TABLE documents (
  doc_hash   TEXT PRIMARY KEY,          -- sha256 hex of the document JSON as submitted
  doc        TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per install per song/engine/separation. A document is served only when
-- at least two installs on different networks submitted the same doc_hash.
CREATE TABLE submissions (
  fingerprint    TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  separation     TEXT NOT NULL,         -- none | hpss | demucs
  install_id     TEXT NOT NULL,
  ip_hash        TEXT NOT NULL,         -- salted hash, never the raw address
  doc_hash       TEXT NOT NULL REFERENCES documents(doc_hash),
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (fingerprint, engine_version, separation, install_id)
);
CREATE INDEX submissions_lookup ON submissions (fingerprint, engine_version, separation, doc_hash);

-- Teacher output, written only by /teach itself (trusted).
CREATE TABLE teaching (
  fingerprint    TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  separation     TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model          TEXT NOT NULL,
  doc            TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (fingerprint, engine_version, separation, prompt_version)
);

-- Global daily ceiling on Teacher calls across all installs.
CREATE TABLE usage_daily (
  day         TEXT PRIMARY KEY,         -- YYYY-MM-DD, UTC
  teach_calls INTEGER NOT NULL DEFAULT 0
);
