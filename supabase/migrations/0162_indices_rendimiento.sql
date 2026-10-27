-- Rendimiento, primera tanda (pedido de Hernán, 27 oct 2026; diagnóstico del 26 oct en Supabase › Query Performance): índices para las
-- consultas que más tiempo de la base se llevaban. El conteo de pedidos en «Novedad» corre en cada página (avisos de «Hoy», `pendientes-hoy.ts`)
-- y recorría las ~118.000 órdenes; los comentarios «Inconveniente…» de Compras, la actividad de cada ficha (historial_auditoria), los
-- eventos de Compras y el historial de Scraping se leen ordenados por fecha. Solo agrega índices: no cambia datos. Correrlo en un momento
-- tranquilo (crear un índice frena por unos segundos las escrituras de esa tabla).
-- Reversa: supabase/rollbacks/0162_rollback.sql

-- Pedidos: el conteo de «Novedad» del país y de Dropi (parcial: solo las filas en Novedad) y las consultas por país, plataforma y fechas.
create index if not exists ordenes_novedad_idx on ordenes (pais_id, plataforma_id) where estado = 'NOVEDAD';
create index if not exists ordenes_pais_plataforma_fecha_idx on ordenes (pais_id, plataforma_id, fecha desc);

-- La actividad de una ficha (entidad + id, la más nueva primero) y los listados por fecha.
create index if not exists historial_auditoria_entidad_idx on historial_auditoria (entidad, entidad_id, creado_en desc);
create index if not exists historial_auditoria_creado_idx on historial_auditoria (creado_en desc);

-- Compras: los comentarios marcados «Inconveniente…» (la tabla de Compras los busca en cada carga).
create index if not exists wms_compra_comentarios_inconveniente_idx on wms_compra_comentarios (creado_en desc) where texto ilike 'inconveniente%';

-- Compras: los eventos leídos por fecha, en páginas (tiempos y fallas, planificación).
create index if not exists wms_compra_eventos_ocurrido_idx on wms_compra_eventos (ocurrido_en, id);

-- Scraping: el historial leído por fecha.
create index if not exists scraping_producto_historial_fecha_idx on scraping_producto_historial (fecha, id);

-- Que el planificador use los índices nuevos desde ya.
analyze ordenes;
analyze historial_auditoria;
analyze wms_compra_comentarios;
analyze wms_compra_eventos;
analyze scraping_producto_historial;
