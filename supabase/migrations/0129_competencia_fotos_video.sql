-- Gestión de IDs Dropi › Optimización (22 oct 2026): de cada producto del catálogo de Dropi, cuántas fotos, cuántos videos y el largo
-- de la descripción, para avisar qué publicaciones nuestras necesitan más fotos, un video o una descripción mejor. Los llena la
-- lectura del catálogo (scripts/scraping-proveedores-navegador.js › scrapingCompetencia) desde la próxima vez que se corra; null =
-- todavía no se leyó (o Dropi no lo trae en esa lectura).
-- Reversa: supabase/rollbacks/0129_rollback.sql

alter table competencia_productos
  add column if not exists fotos integer,
  add column if not exists videos integer,
  add column if not exists descripcion_largo integer;
