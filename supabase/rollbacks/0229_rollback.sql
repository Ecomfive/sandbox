-- Reversa de 0229_dropi_stock_variaciones.sql
drop index if exists dropi_cambios_pendientes_stock_idx;

-- El índice de antes admite un solo cambio por publicación y bodega: los de variaciones y los de un segundo ID no caben, y se quitan de la cola.
delete from dropi_cambios_pendientes where tipo = 'stock' and estado in ('pendiente', 'error') and datos ->> 'firma' is not null;
delete from dropi_cambios_pendientes a using dropi_cambios_pendientes b
  where a.tipo = 'stock' and b.tipo = 'stock' and a.estado in ('pendiente', 'error') and b.estado in ('pendiente', 'error')
    and a.publicacion_id = b.publicacion_id and a.datos ->> 'bodega' = b.datos ->> 'bodega' and a.id > b.id;

create unique index if not exists dropi_cambios_pendientes_stock_idx
  on dropi_cambios_pendientes (publicacion_id, (datos ->> 'bodega')) where tipo = 'stock' and estado in ('pendiente', 'error');
