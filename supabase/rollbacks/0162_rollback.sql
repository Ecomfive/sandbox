-- Reversa de 0162_indices_rendimiento.sql: quita solo los índices (no hay datos que deshacer).
drop index if exists ordenes_novedad_idx;
drop index if exists ordenes_pais_plataforma_fecha_idx;
drop index if exists historial_auditoria_entidad_idx;
drop index if exists historial_auditoria_creado_idx;
drop index if exists wms_compra_comentarios_inconveniente_idx;
drop index if exists wms_compra_eventos_ocurrido_idx;
drop index if exists scraping_producto_historial_fecha_idx;
