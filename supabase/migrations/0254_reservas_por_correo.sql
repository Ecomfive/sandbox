-- Gestión de IDs Dropi › Stock reservado por correo (8 nov 2026, pedido de Alcides: PUB-0010 salía «Privado» y es una publicación pública con unidades reservadas
-- al correo de un dropshipper). La lectura de «Mis productos» abre la ficha de cada producto con algo reservado y guarda:
--  * `privado_producto`: si Dropi lo tiene como producto privado (`privated_product`); null = no se leyó (no tenía nada reservado);
--  * `reservas`: las reservas vivas `[{ id, usuario, correo, nombre, unidades, variacion }]` (`private_product_inventories`).
-- Y la cola de «Aplicar en Dropi» suma el tipo «reserva»: dejar a un correo con unas unidades reservadas (0 = quitar la reserva) en una publicación pública.
-- Código: src/lib/publicaciones/reservas-dropi.ts. Reversa: supabase/rollbacks/0254_rollback.sql

alter table dropi_productos_proveedor add column if not exists privado_producto boolean;
alter table dropi_productos_proveedor add column if not exists reservas jsonb;

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'dropi_cambios_pendientes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo = ANY%' loop
    execute format('alter table dropi_cambios_pendientes drop constraint %I', c);
  end loop;
end $$;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar', 'archivar', 'crear', 'privatizar', 'stock', 'reserva'));

alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar', 'archivar', 'crear', 'privatizar', 'stock', 'reserva') or nombre is not null or precio is not null or precio_sugerido is not null or descripcion is not null or fotos is not null);

-- Una sola reserva esperando por publicación y correo: pedir otra para el mismo correo la reemplaza.
create unique index if not exists dropi_cambios_pendientes_reserva_idx
  on dropi_cambios_pendientes (publicacion_id, lower(datos ->> 'correo')) where tipo = 'reserva' and estado in ('pendiente', 'error');
