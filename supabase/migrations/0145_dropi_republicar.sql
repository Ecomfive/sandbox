-- Gestión de IDs Dropi › «Republicar» (pedido de Hernán, 23 oct 2026): un botón en la ficha de la publicación deja en la cola de
-- «Aplicar en Dropi» una republicación. El favorito, desde la pestaña de Dropi, crea en Dropi un producto nuevo con los mismos datos,
-- fotos y stock, le saca el stock al viejo y lo archiva; al guardar el resultado, el sistema crea la publicación nueva (mismos datos,
-- el ID nuevo y el mismo producto vinculado) y archiva la vieja. Nada se republica solo: siempre lo pide una persona.
-- Código: src/lib/publicaciones/republicar-dropi.ts, cambios-dropi.ts (encolarRepublicar), aplicar-actions.ts.
-- Reversa: supabase/rollbacks/0145_rollback.sql

alter table dropi_cambios_pendientes
  -- «cambio» = nombre y/o precios (lo de siempre); «republicar» = crear el producto de nuevo en Dropi.
  add column if not exists tipo text not null default 'cambio' check (tipo in ('cambio', 'republicar')),
  -- El ID del producto nuevo en Dropi: se guarda apenas Dropi lo crea, aunque falle un paso después, para que el próximo intento
  -- siga desde ahí y no cree otro.
  add column if not exists nuevo_dropi_id integer,
  -- La publicación nueva del sistema, cuando la republicación termina.
  add column if not exists nueva_publicacion_id uuid references dropi_publicaciones(id) on delete set null;

-- Una republicación no lleva nombre ni precios.
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo = 'republicar' or nombre is not null or precio is not null or precio_sugerido is not null);

-- Una sola republicación esperando por publicación.
create unique index if not exists dropi_cambios_pendientes_republicar_idx
  on dropi_cambios_pendientes (publicacion_id) where tipo = 'republicar' and estado in ('pendiente', 'error');
