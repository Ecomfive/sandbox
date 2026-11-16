-- Reversa de 0304: quita las llegadas, los destinatarios y la etapa «En Bodega» (las compras que estén ahí vuelven a «Llegada a Puerto»).
update wms_compras set etapa = 'arribo_mercancia' where etapa = 'en_bodega';
drop table if exists compras_llegada_items;
drop table if exists compras_llegadas;
drop table if exists compras_avisos_destinatarios;
delete from notificaciones_usuario where tipo = 'llegada';
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check
  check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision', 'cierre'));
alter table wms_compras drop constraint if exists wms_compras_etapa_check;
alter table wms_compras add constraint wms_compras_etapa_check check (
  etapa in (
    'backlog', 'solicitud_local', 'solicitud_internacional', 'cotizar', 'enviado_cotizacion', 'cotizado',
    'evaluacion_proveedor', 'solicitud_proveedor', 'compra_pago', 'produccion', 'tracking',
    'aviso_logistica', 'arribo_mercancia', 'completado', 'descartado'
  )
);
-- (La función proveedor_sincronizar de 0270 se vuelve a correr desde su migración si hace falta.)
notify pgrst, 'reload schema';
