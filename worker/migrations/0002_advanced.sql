-- v2-d1 · 0002_advanced.sql — features avanzadas de maria para TODOS los usuarios
-- ⚠️  SUPERSEDED: este dato ya está en seed/0001_core.sql
-- (marcflove incluido). Aplicar tras 0001:
--   npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0002_advanced.sql

-- marcflove → tier advanced: bio extendida, email, más redes, recuperación,
-- favoritos y un hilo (mismas features que maria).
UPDATE identities
SET tier = 'advanced',
    bio = 'Risas y código. Buenos Aires. Creador de Risa liberada y de flove, la distro local-first. Si no me río, no fue bueno.',
    email = 'marc@liberada.net',
    socials = '[{"net":"Telegram","url":"https://t.me/marcflove"},{"net":"GitHub","url":"https://github.com/marcflove"},{"net":"Web","url":"https://flove.org"}]',
    recover = '["bot","email"]',
    updated_at = '2026-08-18'
WHERE username = 'marcflove';

-- Favorito real de marcflove (feed en la nube).
INSERT OR IGNORE INTO favs (key, app, item_id, at) VALUES
('marcflove','risa','q_823020128','2026-08-18');

-- Un hilo de muestra para marcflove (risa → ama).
INSERT OR IGNORE INTO threads (item_id, parent, app, depth) VALUES
('q_823020131','q_823020149','risa',1);
