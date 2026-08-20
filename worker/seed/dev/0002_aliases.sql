-- seed/0002_aliases.sql — aliases de autor (públicos/privados)
-- Aplicar: npx wrangler d1 execute risa-d1 --remote --file=worker/seed/0002_aliases.sql

INSERT OR IGNORE INTO aliases (key, alias, private, created_at) VALUES
('marcflove','Marc',0,'2026-08-18'),
('marcflove','Marcflove',0,'2026-08-18'),
('marcflove','Risalog',1,'2026-08-18'),
('maria','La Risa Yoga',0,'2026-08-18'),
('maria','Contagiosa',0,'2026-08-18'),
('maria','Carcajada',0,'2026-08-18'),
('maria','Prueba',0,'2026-08-18'),
('maria','privi',1,'2026-08-18'),
('maria-adv','Maria',0,'2026-08-18'),
('maria-adv','Adv',0,'2026-08-18'),
('maria-adv','PoC Privado',1,'2026-08-18');
