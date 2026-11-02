-- Gestión de IDs Dropi › «Cambiar stock en Dropi» (pedido de Alcides, 28 oct 2026): el stock de una bodega de ECOMFIVE se edita en el sistema, como el
-- precio, y queda pendiente en la cola de «Aplicar en Dropi» (`tipo = 'stock'`). Lleva en `datos` la bodega (ID de Dropi), su nombre, las unidades
-- que deben quedar, las que mostraba la última lectura (`antes`) y el concepto del movimiento (ver src/lib/publicaciones/stock-dropi.ts › DatosStock).
-- El favorito lee el stock de Dropi en ese momento y hace la entrada o la salida que falte; al confirmarse, el sistema pone ese stock en
-- `dropi_productos_proveedor` sin esperar la próxima lectura. La B280 es de Dropi y no se toca.
-- Código: src/lib/publicaciones/stock-dropi.ts, cambios-dropi.ts (encolarStock), marcador-aplicar-dropi.ts, aplicar-actions.ts.
-- Reversa: supabase/rollbacks/0173_rollback.sql

-- «stock» como un tipo más de cambio (se busca la restricción por lo que dice, no por su nombre).
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'dropi_cambios_pendientes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo = ANY%' loop
    execute format('alter table dropi_cambios_pendientes drop constraint %I', c);
  end loop;
end $$;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar', 'archivar', 'crear', 'privatizar', 'stock'));

-- Un cambio de stock no lleva nombre ni precios propios (van en `datos`).
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar', 'archivar', 'crear', 'privatizar', 'stock') or nombre is not null or precio is not null or precio_sugerido is not null or descripcion is not null or fotos is not null);

-- Un solo cambio de stock esperando por publicación y bodega: pedir otro lo reemplaza.
create unique index if not exists dropi_cambios_pendientes_stock_idx
  on dropi_cambios_pendientes (publicacion_id, (datos ->> 'bodega')) where tipo = 'stock' and estado in ('pendiente', 'error');
