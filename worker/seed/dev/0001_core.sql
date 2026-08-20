-- seed/0001_core.sql — demo users: marcflove (basic→advanced) + maria (advanced)
-- Aplicar: npx wrangler d1 execute risa-d1 --remote --file=worker/seed/0001_core.sql

-- ── marcflove ──
INSERT OR IGNORE INTO identities (key, username, name, bio, email, socials, recover, tier, claimed_at, updated_at)
VALUES ('marcflove', 'marcflove', 'Marc',
        'Risas y código. Buenos Aires. Creador de Risa liberada y de flove, la distro local-first. Si no me río, no fue bueno.',
        'marc@liberada.net',
        '[{"net":"Telegram","url":"https://t.me/marcflove"},{"net":"GitHub","url":"https://github.com/marcflove"},{"net":"Web","url":"https://flove.org"}]',
        '["bot","email"]', 'advanced', '2026-08-18', '2026-08-18');

INSERT OR IGNORE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES
('marcflove','risa','q_823020149','Nosnormal','rural, café, etc','audio',NULL,'2026-08-11'),
('marcflove','risa','q_823020131','Marc · risa','risa libre','audio',NULL,'2026-08-10'),
('marcflove','risa','q_823020128','Marc · risa','risa libre','audio',NULL,'2026-08-10');

INSERT OR IGNORE INTO favs (key, app, item_id, at) VALUES
('marcflove','risa','q_823020128','2026-08-18');

INSERT OR IGNORE INTO threads (item_id, parent, app, depth) VALUES
('q_823020131','q_823020149','risa',1);

-- ── maria ──
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

-- ── maria-adv (PoC demo) ──
INSERT OR IGNORE INTO identities (key, username, name, bio, email, socials, recover, tier, claimed_at, updated_at)
VALUES ('maria-adv', 'maria-adv', 'Maria Adv',
        'Perfil avanzado de PoC: D1, plugins, cadenas visuales y más. Usa esta demo para probar features de v2-d1.',
        'maria.adv@liberada.net',
        '[{"net":"Telegram","url":"https://t.me/mariagarcia"},{"net":"GitHub","url":"https://github.com/maria-adv"},{"net":"Web","url":"https://flove.org"},{"net":"Mastodon","url":"https://mastodon.social/@mariaadv"}]',
        '["bot","email"]', 'advanced', '2026-08-18', '2026-08-18');

INSERT OR IGNORE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES
('maria-adv','risa','q_901','Risa del plugin','plugin, risa','audio',NULL,'2026-08-18'),
('maria-adv','risa','q_902','Cadena D1','cadena, d1','video',NULL,'2026-08-18'),
('maria-adv','ama','q_903','Amor PoC','poc, amor','audio',NULL,'2026-08-18');

INSERT OR IGNORE INTO threads (item_id, parent, app, depth) VALUES
('q_902','q_901','risa',1);

-- ── FTS: core demos ──
INSERT OR IGNORE INTO search_fts (item_id, app, title, tags, name) VALUES
('q_823020149','risa','Nosnormal','rural café','Marc'),
('q_823020131','risa','Marc · risa','risa libre','Marc'),
('q_823020128','risa','Marc · risa','risa libre','Marc'),
('q_101','risa','Yoga y risa','yoga relajación','María'),
('q_102','risa','La que no para','contagiosa felicidad','María'),
('q_103','risa','Con las alumnas','amigas comunidad','María'),
('q_201','ama','Besito de buenos días','amor buenos días','María'),
('q_202','ama','Foto del parcito','parque naturaleza','María'),
('q_203','ama','Amor de domingo','domingo calma','María'),
('q_901','risa','Risa del plugin','plugin risa','Maria'),
('q_902','risa','Cadena D1','cadena d1','Maria'),
('q_903','ama','Amor PoC','poc amor','Maria');
