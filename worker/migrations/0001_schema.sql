-- v2-d1 · 0001_schema.sql — esquema D1 (solo tablas + índices, sin seed)
-- Aplicar: npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0001_schema.sql

PRAGMA foreign_keys = ON;

-- ── Identidad: la key (hash salado de v1) es el id de autor, nunca en claro ──
CREATE TABLE IF NOT EXISTS identities (
  key        TEXT PRIMARY KEY,
  username   TEXT UNIQUE,
  name       TEXT,
  bio        TEXT DEFAULT '',
  email      TEXT,
  socials    TEXT DEFAULT '[]',      -- JSON [{net,url}]
  recover    TEXT DEFAULT '[]',      -- vías: bot · email
  tier       TEXT DEFAULT 'basic',   -- simple | advanced
  claimed_at TEXT,
  updated_at TEXT
);

-- ── Actividad: una fila por pieza publicada en cualquier app de liberada ──
CREATE TABLE IF NOT EXISTS activity (
  key     TEXT NOT NULL,
  app     TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title   TEXT DEFAULT '',
  tags    TEXT DEFAULT '',
  kind    TEXT DEFAULT 'audio',      -- audio | video
  src     TEXT,
  at      TEXT,
  PRIMARY KEY (app, item_id)
);
CREATE INDEX IF NOT EXISTS idx_act_key ON activity(key, at DESC);
CREATE INDEX IF NOT EXISTS idx_act_app ON activity(app, at DESC);

-- ── Favoritos (multi-app): con claim se sincronizan (feed real) ──
CREATE TABLE IF NOT EXISTS favs (
  key     TEXT NOT NULL,
  app     TEXT NOT NULL,
  item_id TEXT NOT NULL,
  at      TEXT,
  PRIMARY KEY (key, app, item_id)
);
CREATE INDEX IF NOT EXISTS idx_favs_key ON favs(key, at DESC);

-- ── Hilos (v2): contadores y posición en el hilo ──
CREATE TABLE IF NOT EXISTS threads (
  item_id TEXT PRIMARY KEY,
  parent  TEXT,
  app     TEXT,
  depth   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_threads_parent ON threads(parent);

-- ── Webhook: idempotencia compartida con el cron ──
CREATE TABLE IF NOT EXISTS updates (
  update_id INTEGER PRIMARY KEY,
  status    TEXT DEFAULT 'received',
  at        TEXT
);
CREATE TABLE IF NOT EXISTS pending_updates (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id INTEGER,
  payload   TEXT,
  at        TEXT
);

-- ── Búsqueda full-text (addon f1SS): FTS5 sobre títulos, tags y nombres ──
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  item_id, app, title, tags, name, content=''
);

-- ── Aliases de autor (públicos/privados) ──
CREATE TABLE IF NOT EXISTS aliases (
  key        TEXT NOT NULL,
  alias      TEXT NOT NULL,
  private    INTEGER DEFAULT 0,     -- 0 público · 1 privado (solo el dueño)
  created_at TEXT,
  PRIMARY KEY (key, alias)
);
CREATE INDEX IF NOT EXISTS idx_alias_key ON aliases(key);
