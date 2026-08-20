-- v2-d1 · 0003_aliases.sql — aliases de autor (públicos/privados) para el
-- ⚠️  SUPERSEDED: este dato ya está en seed/0002_aliases.sql
-- selector de «Autor» del borrador y los chips del perfil.
--   npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0003_aliases.sql

CREATE TABLE IF NOT EXISTS aliases (
  key        TEXT NOT NULL,
  alias      TEXT NOT NULL,
  private    INTEGER DEFAULT 0,     -- 0 público · 1 privado (solo el dueño)
  created_at TEXT,
  PRIMARY KEY (key, alias)
);
CREATE INDEX IF NOT EXISTS idx_alias_key ON aliases(key);

-- Seed · marcflove (2 públicos + 1 privado) y maria (2 públicos + 1 privado).
INSERT OR IGNORE INTO aliases (key, alias, private, created_at) VALUES
('marcflove','Marc',0,'2026-08-18'),
('marcflove','Marcflove',0,'2026-08-18'),
('marcflove','Risalog',1,'2026-08-18'),
('maria','María',0,'2026-08-18'),
('maria','La Risa Yoga',0,'2026-08-18'),
('maria','Demo Privada',1,'2026-08-18');
