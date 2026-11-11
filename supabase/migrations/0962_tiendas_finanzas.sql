-- Portal AF4 360°: las tiendas (Shopify) entran a finanzas igual que la proveeduría (Dropi, 0938).
--
-- `fin_tiendas_mensual`: por mes y tienda, órdenes, entregadas, canceladas, devueltas, lo vendido (entregado) y el
-- efectivo contra entrega (esperado, cobrado, remitido), calculado en Postgres desde `ven_ordenes` y `ven_cod_saldo`.
-- `fin_sincronizar_tiendas()` lo recalcula (llave `tiendas|<unidad>|<mes>`) y deja en Cuentas por cobrar un documento por
-- tienda y mensajero o transportadora con el efectivo que cobró y todavía no remesó (origen 'tiendas', llave
-- `cod|<unidad>|<mensajero o transportadora>`; lo editado a mano no se pisa; si el saldo llega a 0 el documento se quita
-- salvo que tenga abonos). Volver a correrla actualiza, no duplica. RLS activado y sin políticas. Se puede correr dos veces.

create table if not exists fin_tiendas_mensual (
  periodo date not null check (extract(day from periodo) = 1),
  unidad_id uuid not null references fin_unidades(id),
  ordenes integer not null default 0,
  entregadas integer not null default 0,
  canceladas integer not null default 0,
  devueltas integer not null default 0,
  ventas_entregadas numeric(14, 2) not null default 0,
  cod_esperado numeric(14, 2) not null default 0,
  cod_cobrado numeric(14, 2) not null default 0,
  cod_remitido numeric(14, 2) not null default 0,
  origen_clave text not null unique,
  actualizado_en timestamptz not null default now(),
  primary key (periodo, unidad_id)
);
alter table fin_tiendas_mensual enable row level security;

alter table fin_cartera drop constraint if exists fin_cartera_origen_check;
alter table fin_cartera add constraint fin_cartera_origen_check check (origen in ('manual', 'excel', 'dropi', 'tiendas'));

create or replace function fin_sincronizar_tiendas()
returns table (meses integer, documentos integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meses integer := 0;
  v_docs integer := 0;
begin
  with o as (
    select o.periodo, o.unidad_id,
           count(*) as ordenes,
           count(*) filter (where o.estado_entrega = 'entregada') as entregadas,
           count(*) filter (where o.estado_entrega = 'cancelada') as canceladas,
           count(*) filter (where o.estado_entrega = 'devuelta') as devueltas,
           coalesce(sum(o.total) filter (where o.estado_entrega = 'entregada'), 0) as ventas,
           coalesce(sum(o.cod_esperado) filter (where o.estado_entrega not in ('cancelada', 'devuelta')), 0) as esperado
    from ven_ordenes o group by 1, 2
  ), c as (
    select date_trunc('month', s.fecha)::date as periodo, s.unidad_id,
           coalesce(sum(s.cobrado), 0) as cobrado, coalesce(sum(s.remitido), 0) as remitido
    from ven_cod_saldo s group by 1, 2
  ), ins as (
    insert into fin_tiendas_mensual (periodo, unidad_id, ordenes, entregadas, canceladas, devueltas, ventas_entregadas,
                                     cod_esperado, cod_cobrado, cod_remitido, origen_clave, actualizado_en)
    select o.periodo, o.unidad_id, o.ordenes, o.entregadas, o.canceladas, o.devueltas, o.ventas, o.esperado,
           coalesce(c.cobrado, 0), coalesce(c.remitido, 0),
           'tiendas|' || o.unidad_id::text || '|' || to_char(o.periodo, 'YYYY-MM'), now()
    from o left join c on c.periodo = o.periodo and c.unidad_id = o.unidad_id
    where o.periodo is not null
    on conflict (origen_clave) do update set
      ordenes = excluded.ordenes, entregadas = excluded.entregadas, canceladas = excluded.canceladas,
      devueltas = excluded.devueltas, ventas_entregadas = excluded.ventas_entregadas, cod_esperado = excluded.cod_esperado,
      cod_cobrado = excluded.cod_cobrado, cod_remitido = excluded.cod_remitido, actualizado_en = now()
    returning 1
  )
  select count(*) into v_meses from ins;

  -- Efectivo por cobrar a mensajeros y transportadoras.
  with saldo as (
    select s.unidad_id,
           coalesce(r.nombre, nullif(trim(s.transportista), ''), 'Sin asignar') as quien,
           sum(s.pendiente) as pendiente, min(s.fecha) as desde
    from ven_cod_saldo s left join del_repartidores r on r.id = s.repartidor_id
    where s.pendiente > 0 group by 1, 2
  ), up as (
    insert into fin_cartera (clase, contraparte, unidad_id, documento, fecha, motivo, monto, origen, origen_clave)
    select 'cobrar', s.quien, s.unidad_id, 'Efectivo contra entrega', s.desde,
           'Cobrado al cliente y todavía sin remesar', s.pendiente, 'tiendas', 'cod|' || s.unidad_id::text || '|' || upper(s.quien)
    from saldo s
    on conflict (origen_clave) do update set monto = excluded.monto, fecha = excluded.fecha, actualizado_en = now()
      where fin_cartera.editado_a_mano = false
    returning 1
  )
  select count(*) into v_docs from up;

  delete from fin_cartera c
  where c.origen = 'tiendas' and c.editado_a_mano = false
    and not exists (select 1 from fin_cartera_abonos a where a.documento_id = c.id)
    and not exists (
      select 1 from ven_cod_saldo s left join del_repartidores r on r.id = s.repartidor_id
      where s.pendiente > 0
        and c.origen_clave = 'cod|' || s.unidad_id::text || '|' || upper(coalesce(r.nombre, nullif(trim(s.transportista), ''), 'Sin asignar'))
    );
  return query select v_meses, v_docs;
end;
$$;
revoke all on function fin_sincronizar_tiendas() from public, anon, authenticated;
