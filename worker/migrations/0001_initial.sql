-- v2-d1 · 0001_initial.sql — esquema D1 + seed (marcflove simple · maria avanzada)
-- Aplicar: npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0001_initial.sql

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

-- ── Seed · marcflove (demo simple: nombre + actividad) ──
INSERT OR IGNORE INTO identities (key, username, name, bio, email, socials, recover, tier, claimed_at, updated_at)
VALUES ('marcflove', 'marcflove', 'Marc', 'Risas y código. Buenos Aires.', NULL,
        '[{"net":"GitHub","url":"https://github.com/marcflove"},{"net":"Web","url":"https://flove.org"}]',
        '["bot"]', 'basic', '2026-08-18', '2026-08-18');

INSERT OR IGNORE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES
('marcflove','risa','q_823020149','Nosnormal','rural, café, etc','audio',NULL,'2026-08-11'),
('marcflove','risa','q_823020131','Marc · risa','risa libre','audio',NULL,'2026-08-10'),
('marcflove','risa','q_823020128','Marc · risa','risa libre','audio',NULL,'2026-08-10');

-- ── Seed · maria (demo avanzada: bio extendida, socials varias, email, actividad cruzada) ──
INSERT OR IGNORE INTO identities (key, username, name, bio, email, socials, recover, tier, claimed_at, updated_at)
VALUES ('maria', 'maria', 'María Demostración',
        'Profesora de yoga, amante de las risas espontáneas. Si no me río, no fue bueno. Practico yoga de la risa desde 2019 y doy clases cada sábado en el parque.',
        'maria@liberada.net',
        '[{"net":"Telegram","url":"https://t.me/mariagarcia"},{"net":"Web","url":"https://mariagarcia.com"},{"net":"Instagram","url":"https://instagram.com/maria.yoga"},{"net":"Mastodon","url":"https://mastodon.social/@maria"}]',
        '["bot","email"]', 'advanced', '2026-08-18', '2026-08-18');

INSERT OR IGNORE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES
('maria','risa','q_101','Yoga y risa','yoga, relajación','audio',NULL,'2026-08-16'),
('maria','risa','q_102','La que no para','contagiosa, felicidad','audio',NULL,'2026-08-14'),
('maria','risa','q_103','Con las alumnas','amigas, comunidad','video',NULL,'2026-08-08'),
('maria','ama','q_201','Besito de buenos días','amor, buenos días','audio',NULL,'2026-08-06'),
('maria','ama','q_202','Foto del parcito','parque, naturaleza','video',NULL,'2026-08-04'),
('maria','ama','q_203','Amor de domingo','domingo, calma','audio',NULL,'2026-08-05');

INSERT OR IGNORE INTO threads (item_id, parent, app, depth) VALUES
('q_103','q_101','risa',1),
('q_203','q_201','ama',1);

INSERT OR IGNORE INTO search_fts (item_id, app, title, tags, name) VALUES
('q_823020149','risa','Nosnormal','rural café','Marc'),
('q_823020131','risa','Marc · risa','risa libre','Marc'),
('q_823020128','risa','Marc · risa','risa libre','Marc'),
('q_101','risa','Yoga y risa','yoga relajación','María'),
('q_102','risa','La que no para','contagiosa felicidad','María'),
('q_103','risa','Con las alumnas','amigas comunidad','María'),
('q_201','ama','Besito de buenos días','amor buenos días','María'),
('q_202','ama','Foto del parcito','parque naturaleza','María'),
('q_203','ama','Amor de domingo','domingo calma','María');
