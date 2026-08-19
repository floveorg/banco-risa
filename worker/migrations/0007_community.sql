-- v2-d1 · 0007_community.sql — comunidad y métricas nativas en D1
--   follows (seguir) · reactions (reacciones rápidas con emoji) · plays ·
--   notifications + notify_prefs · replies (respuestas rápidas de la web).
--   npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0007_community.sql

CREATE TABLE IF NOT EXISTS follows (
  follower TEXT NOT NULL,
  target   TEXT NOT NULL,
  at       TEXT,
  PRIMARY KEY (follower, target)
);
CREATE INDEX IF NOT EXISTS idx_follows_target   ON follows(target, at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower, at DESC);

-- Reacción = un emoji por clip (publica, sin identidad obligatoria).
CREATE TABLE IF NOT EXISTS reactions (
  app      TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  reaction TEXT NOT NULL,
  at       TEXT,
  PRIMARY KEY (app, item_id, reaction)
);
CREATE INDEX IF NOT EXISTS idx_reactions_item ON reactions(app, item_id, at DESC);

-- Escuchas: 1 fila por reproducción (para trending, sin identidad).
CREATE TABLE IF NOT EXISTS plays (
  app     TEXT NOT NULL,
  item_id TEXT NOT NULL,
  at      TEXT,
  PRIMARY KEY (app, item_id, at)
);
CREATE INDEX IF NOT EXISTS idx_plays_item ON plays(app, item_id, at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  key   TEXT NOT NULL,
  kind  TEXT NOT NULL,          -- reply | follow
  ref   TEXT,
  at    TEXT,
  seen  INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_key ON notifications(key, at DESC);

CREATE TABLE IF NOT EXISTS notify_prefs (
  key     TEXT PRIMARY KEY,
  replies INTEGER DEFAULT 1     -- 1 = avisar de respuestas, 0 = apagado
);

-- Respuestas rápidas de la web (emoji/quick): mini-hilo sin audio.
CREATE TABLE IF NOT EXISTS replies (
  app      TEXT NOT NULL,
  parent   TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  kind     TEXT DEFAULT 'quick',  -- quick (emoji) | text
  content  TEXT,
  name     TEXT,
  at       TEXT,
  PRIMARY KEY (app, item_id)
);
CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(app, parent, at DESC);
