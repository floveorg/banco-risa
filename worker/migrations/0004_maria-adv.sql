-- v2-d1 · 0004_maria-adv.sql — identidad avanzada de PoC (D1 + plugins) para
-- ⚠️  SUPERSEDED: este dato ya está en seed/0001_core.sql
-- liberada.net/usa/maria-adv/. Aplicar tras 0003.

INSERT OR IGNORE INTO identities (key, username, name, bio, email, socials, recover, tier, claimed_at, updated_at)
VALUES ('maria-adv', 'maria-adv', 'María Adv',
        'Perfil avanzado de PoC: D1, plugins, cadenas visuales y más. Usa esta demo para probar features de v2-d1.',
        'maria.adv@liberada.net',
        '[{"net":"Telegram","url":"https://t.me/mariagarcia"},{"net":"GitHub","url":"https://github.com/maria-adv"},{"net":"Web","url":"https://flove.org"},{"net":"Mastodon","url":"https://mastodon.social/@mariaadv"}]',
        '["bot","email"]', 'advanced', '2026-08-18', '2026-08-18');

INSERT OR IGNORE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES
('maria-adv','risa','q_901','Risa del plugin','plugin, risa','audio',NULL,'2026-08-18'),
('maria-adv','risa','q_902','Cadena D1','cadena, d1','video',NULL,'2026-08-18'),
('maria-adv','ama','q_903','Amor PoC','poc, amor','audio',NULL,'2026-08-18');

INSERT OR IGNORE INTO aliases (key, alias, private, created_at) VALUES
('maria-adv','María',0,'2026-08-18'),
('maria-adv','Adv',0,'2026-08-18'),
('maria-adv','PoC Privado',1,'2026-08-18');

INSERT OR IGNORE INTO threads (item_id, parent, app, depth) VALUES
('q_902','q_901','risa',1);

INSERT OR IGNORE INTO search_fts (item_id, app, title, tags, name) VALUES
('q_901','risa','Risa del plugin','plugin risa','María'),
('q_902','risa','Cadena D1','cadena d1','María'),
('q_903','ama','Amor PoC','poc amor','María');
