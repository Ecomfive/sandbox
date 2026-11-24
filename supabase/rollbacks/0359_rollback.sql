-- Reversa de 0359: las compras en un lote de llegada a puerto vuelven a «Llegada a Puerto» y se quita la fecha de llegada a puerto.
update wms_compras set etapa = 'arribo_mercancia' where etapa in ('llegada_puerto_lote_1', 'llegada_puerto_lote_2', 'llegada_puerto_lote_3');
alter table wms_compras drop column if exists fecha_llegada_puerto;
alter table wms_compras drop constraint if exists wms_compras_etapa_check;
alter table wms_compras add constraint wms_compras_etapa_check check (
  etapa in (
    'backlog', 'solicitud_local', 'solicitud_internacional', 'cotizar', 'enviado_cotizacion', 'cotizado',
    'evaluacion_proveedor', 'solicitud_proveedor', 'compra_pago', 'produccion', 'tracking',
    'aviso_logistica', 'arribo_mercancia', 'en_bodega', 'completado', 'descartado'
  )
);
-- (La función proveedor_sincronizar de 0304 se vuelve a correr desde su migración si hace falta.)
notify pgrst, 'reload schema';
