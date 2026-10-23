-- Gestión de IDs Dropi › «Apagar en Dropi» (pedido de Hernán, 23 oct 2026): lo que hace Nicole a mano cuando un producto se queda sin
-- stock, como un cambio pendiente de la cola de «Aplicar en Dropi». El favorito, desde la pestaña de Dropi, saca todo el stock
-- (concepto «stock»), con `quitar_privados` quita la privatización (borrar el correo en «Productos privados»), comprueba que quedó en
-- cero y archiva. Si Dropi no deja archivar (órdenes pendientes) el cambio sigue pendiente con el motivo y el próximo «Aplicar en
-- Dropi» solo repite el archivado. Nada se apaga solo: siempre lo pide una persona.
-- Código: src/lib/publicaciones/apagar-dropi.ts, cambios-dropi.ts (encolarApagar), aplicar-actions.ts.
-- Reversa: supabase/rollbacks/0148_rollback.sql

-- «apagar» como tercer tipo de cambio (se busca la restricción por lo que dice, no por su nombre).
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'dropi_cambios_pendientes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo = ANY%' loop
    execute format('alter table dropi_cambios_pendientes drop constraint %I', c);
  end loop;
end $$;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar'));

-- Si al apagarlo también se quita la privatización (un producto privado, asignado a un correo).
alter table dropi_cambios_pendientes add column if not exists quitar_privados boolean not null default false;

-- Un apagado no lleva nombre ni precios.
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar') or nombre is not null or precio is not null or precio_sugerido is not null);

-- Un solo apagado esperando por publicación.
create unique index if not exists dropi_cambios_pendientes_apagar_idx
  on dropi_cambios_pendientes (publicacion_id) where tipo = 'apagar' and estado in ('pendiente', 'error');
