-- Operación › Gestión de tienda › Reportería de pedidos (17 nov 2026, pedido de Hernán; prototipo https://claude.ai/artifact/TNhc38acs7JZzNcsLSgUze).
-- La Matriz de administración («NUEVA GESTION OCEANS PANAMA», hoja «Excel Matriz») pasa a vivir en el sistema: la primera carga sale del Excel y
-- después María José y su equipo trabajan aquí. Esta migración agrega:
-- 1) Las columnas de la Matriz que `ven_ordenes` no guardaba (estaban sumadas o solo servían para deducir el estado).
-- 2) La provincia del cliente (la Matriz la trae aparte del corregimiento).
-- 3) `ven_orden_ediciones`: cada cambio hecho a mano en la Reportería (quién, qué columna, antes y después). Es la pestaña «MOVIMIENTOS» del
--    Excel, y también dice qué columnas ya no se toman de la Matriz al actualizar (gana lo editado en el sistema).
-- 4) `ven_reporteria_aplicar(datos)`: escribe esas columnas en bloque desde la Matriz sin pisar lo editado a mano ni borrar lo que ya hay.
-- 5) El módulo «tienda-reporteria» para los roles que ya abren Ventas por tienda o Pedidos de tienda.
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0310_rollback.sql

alter table ven_ordenes
  add column if not exists estado_matriz text,            -- «ENTREGADO / ANULADO / DEVOLUCIÓN» tal como lo escribe la Matriz
  add column if not exists verificado text,               -- «VERIFICADO» (OK, NO GESTIONADO, CANCELADO…)
  add column if not exists preparacion text,              -- «PREPARACIÓN DEL PEDIDO»
  add column if not exists courier_matriz text,           -- «COURIER» tal cual (también trae estados: NO GESTIONADO, CANCELADO…)
  add column if not exists monto_envio numeric(12,2),     -- «MONTO ENVIO» (repartidor); `costo_envio` sigue siendo la suma
  add column if not exists monto_envio_se numeric(12,2),  -- «MONTO ENVIO SE» (Servientrega)
  add column if not exists monto_pagado_delivery numeric(12,2), -- «MONTO PAGADO AL DELIVERY»
  add column if not exists delivery text,                 -- «DELIVERY»
  add column if not exists cambio_monto numeric(12,2),    -- «MONTO DE CAMBIO»
  add column if not exists cambio_forma_pago text,        -- «FORMA DE PAGO DEL CAMBIO»
  add column if not exists cambio_envio numeric(12,2),    -- «ENVÍO DE CAMBIO»
  add column if not exists fecha_devolucion_texto text,   -- «FECHA- DEVOLUCION/CAMBIOS/RETIROS/COMPLE…» tal cual («D-08/04/2026», «C-…»)
  add column if not exists bloque_facturado text,         -- «BLOQUE FACTURADO»
  add column if not exists matriz_en timestamptz;         -- la última vez que se tomó de la Matriz

alter table ven_ordenes_clientes add column if not exists provincia text;

create table if not exists ven_orden_ediciones (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ven_ordenes(id) on delete cascade,
  campo text not null,
  antes text,
  despues text,
  usuario_id uuid references perfiles(id) on delete set null,
  usuario_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists ven_orden_ediciones_orden on ven_orden_ediciones (orden_id, campo);
create index if not exists ven_orden_ediciones_fecha on ven_orden_ediciones (creado_en desc);
alter table ven_orden_ediciones enable row level security;

-- Escribe en bloque lo que trae la Matriz. `datos` es un arreglo de objetos con `id` (de la orden) y las columnas; `fijos` (texto[]) son las
-- columnas que alguien editó a mano en esa orden: esas no se tocan. Un valor vacío de la Matriz no borra lo que ya hay.
create or replace function ven_reporteria_aplicar(datos jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (
    select * from jsonb_to_recordset(datos) as x(
      id uuid, fijos text[],
      estado_matriz text, verificado text, preparacion text, courier_matriz text,
      monto_envio numeric, monto_envio_se numeric, monto_pagado_delivery numeric, delivery text,
      cambio_monto numeric, cambio_forma_pago text, cambio_envio numeric, fecha_devolucion_texto text,
      bloque_facturado text, facturado boolean, factura_numero text, mes_gestion text, motivo_cancelacion text
    )
  )
  update ven_ordenes o set
    estado_matriz = case when 'estado_matriz' = any(coalesce(d.fijos, '{}')) then o.estado_matriz else coalesce(d.estado_matriz, o.estado_matriz) end,
    verificado = case when 'verificado' = any(coalesce(d.fijos, '{}')) then o.verificado else coalesce(d.verificado, o.verificado) end,
    preparacion = case when 'preparacion' = any(coalesce(d.fijos, '{}')) then o.preparacion else coalesce(d.preparacion, o.preparacion) end,
    courier_matriz = coalesce(d.courier_matriz, o.courier_matriz),
    monto_envio = case when 'monto_envio' = any(coalesce(d.fijos, '{}')) then o.monto_envio else coalesce(d.monto_envio, o.monto_envio) end,
    monto_envio_se = case when 'monto_envio_se' = any(coalesce(d.fijos, '{}')) then o.monto_envio_se else coalesce(d.monto_envio_se, o.monto_envio_se) end,
    monto_pagado_delivery = case when 'monto_pagado_delivery' = any(coalesce(d.fijos, '{}')) then o.monto_pagado_delivery else coalesce(d.monto_pagado_delivery, o.monto_pagado_delivery) end,
    delivery = case when 'delivery' = any(coalesce(d.fijos, '{}')) then o.delivery else coalesce(d.delivery, o.delivery) end,
    cambio_monto = case when 'cambio_monto' = any(coalesce(d.fijos, '{}')) then o.cambio_monto else coalesce(d.cambio_monto, o.cambio_monto) end,
    cambio_forma_pago = case when 'cambio_forma_pago' = any(coalesce(d.fijos, '{}')) then o.cambio_forma_pago else coalesce(d.cambio_forma_pago, o.cambio_forma_pago) end,
    cambio_envio = case when 'cambio_envio' = any(coalesce(d.fijos, '{}')) then o.cambio_envio else coalesce(d.cambio_envio, o.cambio_envio) end,
    fecha_devolucion_texto = case when 'fecha_devolucion_texto' = any(coalesce(d.fijos, '{}')) then o.fecha_devolucion_texto else coalesce(d.fecha_devolucion_texto, o.fecha_devolucion_texto) end,
    bloque_facturado = case when 'bloque_facturado' = any(coalesce(d.fijos, '{}')) then o.bloque_facturado else coalesce(d.bloque_facturado, o.bloque_facturado) end,
    facturado = case when 'facturado' = any(coalesce(d.fijos, '{}')) then o.facturado else coalesce(d.facturado, false) or coalesce(o.facturado, false) end,
    factura_numero = case when 'factura_numero' = any(coalesce(d.fijos, '{}')) then o.factura_numero else coalesce(d.factura_numero, o.factura_numero) end,
    mes_gestion = case when 'mes_gestion' = any(coalesce(d.fijos, '{}')) then o.mes_gestion else coalesce(d.mes_gestion, o.mes_gestion) end,
    motivo_cancelacion = case when 'motivo_cancelacion' = any(coalesce(d.fijos, '{}')) then o.motivo_cancelacion else coalesce(o.motivo_cancelacion, d.motivo_cancelacion) end,
    costo_envio = case when d.monto_envio is null and d.monto_envio_se is null then o.costo_envio
      else coalesce(case when 'monto_envio' = any(coalesce(d.fijos, '{}')) then o.monto_envio else coalesce(d.monto_envio, o.monto_envio) end, 0)
         + coalesce(case when 'monto_envio_se' = any(coalesce(d.fijos, '{}')) then o.monto_envio_se else coalesce(d.monto_envio_se, o.monto_envio_se) end, 0) end,
    matriz_en = now()
  from d
  where o.id = d.id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function ven_reporteria_aplicar(jsonb) from public, anon, authenticated;

-- El módulo para quien ya abre Ventas por tienda (Finanzas) o Pedidos de tienda; solo lectura si en todos los que tiene es de solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, 'tienda-reporteria', bool_and(pr.solo_lectura)
from permisos_rol pr
where pr.modulo in ('ventas-tiendas', 'tienda-pedidos')
group by pr.rol_id
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';
