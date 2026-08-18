-- v2-d1 · 0005_world_demo.sql — usuarios demo reales con los clips de la
-- playlist «Risas del mundo» (sin subdominio, sin contactos, bio demo).
--   npx wrangler d1 execute risa-d1 --remote --file=worker/migrations/0005_world_demo.sql

-- Identidades demo (tier basic, sin email/socials/recover → no subdominio).
INSERT OR IGNORE INTO identities (key, username, name, bio, tier, claimed_at, updated_at) VALUES
('contagiosa', 'contagiosa', 'Risa Contagiosa', 'Soy una demo 😄 — réplica de la playlist «Risa contagiosa». No tengo Telegram ni subdominio; solo río en bucle.', 'basic', '2026-08-18', '2026-08-18'),
('carcajada', 'carcajada', 'Carcajada Suelta', 'Demo de risa de vientre 🤣 — no me escribas, me río sola. Sin contactos, sin subdominio, sin dramas.', 'basic', '2026-08-18', '2026-08-18'),
('mundo', 'mundo', 'Risas del Mundo', 'Demo viajera 🌍 — río en alemán, francés y bebé. Perfil de juguete: sin subdominio y sin redes (pero con mucha risa).', 'basic', '2026-08-18', '2026-08-18');

-- Actividad: los clips reales de la playlist (audio público en R2).
INSERT OR IGNORE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES
('contagiosa','risa','w_multitud','Risa de multitud','contagiosa, multitud','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/multitud-risa.mp3','2026-08-18'),
('contagiosa','risa','w_solo','Solo risas','contagiosa, multitud','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/multitud-solo.mp3','2026-08-18'),
('contagiosa','risa','w_aplauso','Risas y aplausos','contagiosa, aplausos','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/multitud-risa-aplauso.mp3','2026-08-18'),
('contagiosa','risa','w_grupo','Grupo pequeño','contagiosa, grupo','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/grupo-pequeno.mp3','2026-08-18'),
('carcajada','risa','w_carcajada','Carcajada','carcajada, vientre','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/carcajada-solo.mp3','2026-08-18'),
('carcajada','risa','w_carcajadon','Carcajadón','carcajada, epica','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/carcajadon.mp3','2026-08-18'),
('carcajada','risa','w_corta','Risa corta','carcajada, corta','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/risa-corta-pd.mp3','2026-08-18'),
('carcajada','risa','w_guffaw','Risotada','carcajada, risotada','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/guffaw-us.mp3','2026-08-18'),
('mundo','risa','w_paris','Rire (París)','mundo, francés','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/rire-paris.mp3','2026-08-18'),
('mundo','risa','w_quebec','Rire (Quebec)','mundo, francés','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/rire-quebec.mp3','2026-08-18'),
('mundo','risa','w_bebe','Risa de bebé','mundo, bebé','audio','https://pub-e3cbc6c5f1c945358670af27745479f1.r2.dev/risa/seed/audio/bebe-risa.mp3','2026-08-18'),
('mundo','risa','w_amazigh','Ja-ja amazigh','mundo, amazigh','audio',NULL,'2026-08-18');

INSERT OR IGNORE INTO search_fts (item_id, app, title, tags, name) VALUES
('w_multitud','risa','Risa de multitud','contagiosa multitud','Risa Contagiosa'),
('w_solo','risa','Solo risas','contagiosa multitud','Risa Contagiosa'),
('w_carcajada','risa','Carcajada','carcajada vientre','Carcajada Suelta'),
('w_carcajadon','risa','Carcajadón','carcajada epica','Carcajada Suelta'),
('w_paris','risa','Rire (París)','mundo francés','Risas del Mundo'),
('w_bebe','risa','Risa de bebé','mundo bebé','Risas del Mundo');

-- Aliases reales de maria: reemplaza los del seed 0003 por los de la demo
-- (La Risa Yoga · Contagiosa · Carcajada · Alias privado).
DELETE FROM aliases WHERE key = 'maria';
INSERT OR IGNORE INTO aliases (key, alias, private, created_at) VALUES
('maria','La Risa Yoga',0,'2026-08-18'),
('maria','Contagiosa',0,'2026-08-18'),
('maria','Carcajada',0,'2026-08-18'),
('maria','Prueba',0,'2026-08-18'),
('maria','Alias privado',1,'2026-08-18'),
('maria','Prueba privado',1,'2026-08-18');
