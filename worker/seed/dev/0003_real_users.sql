-- seed/0003_real_users.sql — usuarios demo reales con clips de «Risas del mundo»
-- Aplicar: npx wrangler d1 execute risa-d1 --remote --file=worker/seed/0003_real_users.sql

-- ── Identidades ──
INSERT OR IGNORE INTO identities (key, username, name, bio, tier, claimed_at, updated_at) VALUES
('ana','ana','Ana Perez','Profesora de yoga. La risa es la mejor asana: respirar, soltar y reír en grupo.','basic','2026-08-18','2026-08-18'),
('carlos','carlos','Carlos Ruiz','Músico callejero. Ritmo, melodía y carcajadas — la risa también se afina.','basic','2026-08-18','2026-08-18'),
('laura','laura','Laura Diaz','Pintora y ceramista. El color también se ríe; subo risas que parecen cuadros.','basic','2026-08-18','2026-08-18'),
('pedro','pedro','Pedro Lopez','Runner de domingo. Corro, sudo y río — el mejor km termina en carcajada.','basic','2026-08-18','2026-08-18'),
('sofia','sofia','Sofia Torres','Bailarina. Baile y risa, siempre en pareja: la carcajada es el mejor compás.','basic','2026-08-18','2026-08-18');

-- ── Actividad: clips de «Risas del mundo» (Wikimedia Commons) ──
INSERT OR IGNORE INTO activity (key, app, item_id, title, tags, kind, src, at) VALUES
('ana','risa','w_ana_grupo','Grupo pequeño','yoga, grupo, serena','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Small_group_laughter.ogg','2026-08-18'),
('laura','risa','w_laura_bebe','Risa de bebé','arte, bebé, alegría','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Baby_Laugh.ogg','2026-08-18'),
('carlos','risa','w_carlos_paris','Rire (Paris)','música, francés, París','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Fr-Rire-fr-Paris.ogg','2026-08-18'),
('carlos','risa','w_carlos_quebec','Rire (Quebec)','música, francés, Quebec','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Qc-rire.ogg','2026-08-18'),
('sofia','risa','w_sofia_risotada','Risotada','baile, risotada','audio','https://commons.wikimedia.org/wiki/Special:FilePath/En-us-guffaw.ogg','2026-08-18'),
('pedro','risa','w_pedro_multitud','Risa de multitud','deporte, multitud, energía','audio','https://commons.wikimedia.org/wiki/Special:FilePath/72842_lonemonk_approx-800-laugh-1.wav','2026-08-18'),
('pedro','risa','w_pedro_solo','Solo risas','deporte, multitud','audio','https://commons.wikimedia.org/wiki/Special:FilePath/72843_lonemonk_approx-800-laughter-only-1.wav','2026-08-18'),
('sofia','risa','w_sofia_carcajadon','Carcajadón','baile, épica','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Laughter.ogg','2026-08-18'),
('ana','risa','w_ana_alemania','Risa (Alemania)','yoga, mundo, tranquila','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Menschen-Lachen.ogg','2026-08-18'),
('laura','risa','w_laura_bebefra','Risa de bebé (Francia)','arte, bebé, francés','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Rire_de_b%C3%A9b%C3%A9_de_9_mois.ogg','2026-08-18'),
('pedro','risa','w_pedro_aplausos','Risas y aplausos','deporte, aplausos','audio','https://commons.wikimedia.org/wiki/Special:FilePath/72844_lonemonk_approx-800-laughter-and-clapter-1.wav','2026-08-18'),
('sofia','risa','w_sofia_carcajada','Carcajada','baile, vientre','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Laugh.wav','2026-08-18'),
('carlos','risa','w_carlos_corta','Risa corta','música, corta','audio','https://commons.wikimedia.org/wiki/Special:FilePath/En-us-laugh.ogg','2026-08-18'),
('laura','risa','w_laura_lol','Risa «lol»','arte, risa, corta','audio','https://commons.wikimedia.org/wiki/Special:FilePath/Man_saying_lol.oga','2026-08-18');

-- ── Hilos (cadenas) ──
INSERT OR IGNORE INTO threads (item_id, parent, app, depth) VALUES
('w_ana_grupo','q_823020302','risa',1),
('w_laura_bebe','w_ana_grupo','risa',2),
('w_carlos_paris','q_823020291','risa',1),
('w_carlos_quebec','w_carlos_paris','risa',2),
('w_sofia_risotada','q_823020291','risa',1),
('w_pedro_multitud','w_sofia_risotada','risa',2),
('w_pedro_solo','w_pedro_multitud','risa',3),
('w_sofia_carcajadon','q_823020265','risa',1),
('w_ana_alemania','q_823020265','risa',1),
('w_laura_bebefra','w_ana_alemania','risa',2),
('w_pedro_aplausos','q_823020265','risa',1),
('w_sofia_carcajada','q_823020265','risa',1),
('w_carlos_corta','q_823020149','risa',1),
('w_laura_lol','q_823020149','risa',1);

-- ── FTS ──
INSERT OR IGNORE INTO search_fts (item_id, app, title, tags, name) VALUES
('w_ana_grupo','risa','Grupo pequeño','yoga grupo serena','Ana Perez'),
('w_laura_bebe','risa','Risa de bebé','arte bebé alegría','Laura Diaz'),
('w_carlos_paris','risa','Rire (Paris)','música francés París','Carlos Ruiz'),
('w_carlos_quebec','risa','Rire (Quebec)','música francés Quebec','Carlos Ruiz'),
('w_sofia_risotada','risa','Risotada','baile risotada','Sofia Torres'),
('w_pedro_multitud','risa','Risa de multitud','deporte multitud energía','Pedro Lopez'),
('w_pedro_solo','risa','Solo risas','deporte multitud','Pedro Lopez'),
('w_sofia_carcajadon','risa','Carcajadón','baile épica','Sofia Torres'),
('w_ana_alemania','risa','Risa (Alemania)','yoga mundo tranquila','Ana Perez'),
('w_laura_bebefra','risa','Risa de bebé (Francia)','arte bebé francés','Laura Diaz'),
('w_pedro_aplausos','risa','Risas y aplausos','deporte aplausos','Pedro Lopez'),
('w_sofia_carcajada','risa','Carcajada','baile vientre','Sofia Torres'),
('w_carlos_corta','risa','Risa corta','música corta','Carlos Ruiz'),
('w_laura_lol','risa','Risa «lol»','arte risa corta','Laura Diaz');
