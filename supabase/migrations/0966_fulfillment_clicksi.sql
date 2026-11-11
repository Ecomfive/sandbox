-- 0966 · Lo que sí es nuestro de un cliente de fulfillment (Clicksi): la tarifa por orden y el efectivo que se le debe.
--
-- `fin_unidades.tarifa_fulfillment` = lo que se le cobra por cada orden entregada (US$; vacío = todavía sin tarifa).
-- `fin_sincronizar_fulfillment()`, por tienda de cliente de fulfillment (0965) y mes de la orden, en meses abiertos:
--  · Ingresos «Servicio de fulfillment» en el libro = entregadas × tarifa (origen `fulfillment`, solo EERR: la plata entra al cobrarla).
--  · Cuentas por cobrar al cliente, por ese mismo monto (llave `fulfillment|<unidad>|<mes>`).
--  · Cuentas por pagar al cliente: el efectivo contra entrega que cobraron los mensajeros de sus órdenes, porque es suyo
--    (llave `ff-cod|<unidad>|<mes>`). Lo que se le remite o se le descuenta se anota como abono.
-- Lo editado a mano no se pisa; un documento con abonos no se borra. Idempotente: se puede correr las veces que haga falta.

alter table fin_unidades add column if not exists tarifa_fulfillment numeric(10, 2) check (tarifa_fulfillment is null or tarifa_fulfillment >= 0);
comment on column fin_unidades.tarifa_fulfillment is 'Portal AF4 360°: US$ por orden entregada que se le cobra a un cliente de fulfillment (Clicksi).';

alter table fin_cartera drop constraint if exists fin_cartera_origen_check;
alter table fin_cartera add constraint fin_cartera_origen_check check (origen in ('manual', 'excel', 'dropi', 'tiendas', 'fulfillment'));

create or replace function fin_sincronizar_fulfillment()
returns table (ingresos integer, por_cobrar integer, por_pagar integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tipo uuid;
  v_ing integer := 0;
  v_cob integer := 0;
  v_pag integer := 0;
begin
  select id into v_tipo from fin_tipos where nombre = 'Ingresos';
  if v_tipo is null then raise exception 'Falta el tipo «Ingresos» en el libro.'; end if;

  create temp table _ff on commit drop as
  select u.id as unidad_id, u.nombre, o.periodo,
         count(*) filter (where o.estado_entrega = 'entregada') as entregadas,
         round(count(*) filter (where o.estado_entrega = 'entregada') * coalesce(u.tarifa_fulfillment, 0), 2) as tarifa_total,
         coalesce(u.tarifa_fulfillment, 0) as tarifa
  from ven_ordenes o
  join fin_unidades u on u.id = o.unidad_id and u.cliente_fulfillment
  where o.periodo is not null
    and not exists (select 1 from fin_cierres f where f.periodo = o.periodo and f.estado = 'cerrado')
  group by u.id, u.nombre, o.periodo, u.tarifa_fulfillment;

  create temp table _ffcod on commit drop as
  select u.id as unidad_id, u.nombre, date_trunc('month', s.fecha)::date as periodo, sum(s.cobrado) as cobrado, min(s.fecha) as desde
  from ven_cod_saldo s
  join fin_unidades u on u.id = s.unidad_id and u.cliente_fulfillment
  where not exists (select 1 from fin_cierres f where f.periodo = date_trunc('month', s.fecha)::date and f.estado = 'cerrado')
  group by u.id, u.nombre, date_trunc('month', s.fecha)
  having sum(s.cobrado) > 0;

  -- Ingresos del servicio.
  with up as (
    insert into fin_movimientos (periodo, fecha_registro, unidad_id, tipo_id, descripcion, en_eerr, en_flujo, monto, origen, origen_clave)
    select t.periodo, t.periodo, t.unidad_id, v_tipo, 'Servicio de fulfillment (' || t.entregadas || ' órdenes entregadas)', true, false,
           t.tarifa_total, 'fulfillment', 'fulfillment|' || t.unidad_id::text || '|' || to_char(t.periodo, 'YYYY-MM')
    from _ff t where t.tarifa_total > 0
    on conflict (origen_clave) do update set monto = excluded.monto, descripcion = excluded.descripcion, actualizado_en = now()
      where fin_movimientos.monto <> excluded.monto
    returning 1
  )
  select count(*) into v_ing from up;

  delete from fin_movimientos m
  where m.origen = 'fulfillment'
    and not exists (select 1 from fin_cierres f where f.periodo = m.periodo and f.estado = 'cerrado')
    and not exists (select 1 from conc_pares p where p.movimiento_id = m.id)
    and not exists (select 1 from _ff t where t.tarifa_total > 0 and m.origen_clave = 'fulfillment|' || t.unidad_id::text || '|' || to_char(t.periodo, 'YYYY-MM'));

  -- Por cobrar: la tarifa del mes.
  with up as (
    insert into fin_cartera (clase, contraparte, unidad_id, documento, fecha, motivo, monto, origen, origen_clave)
    select 'cobrar', t.nombre, t.unidad_id, 'Fulfillment ' || to_char(t.periodo, 'YYYY-MM'), (t.periodo + interval '1 month - 1 day')::date,
           t.entregadas || ' órdenes entregadas × US$' || t.tarifa, t.tarifa_total, 'fulfillment',
           'fulfillment|' || t.unidad_id::text || '|' || to_char(t.periodo, 'YYYY-MM')
    from _ff t where t.tarifa_total > 0
    on conflict (origen_clave) do update set monto = excluded.monto, motivo = excluded.motivo, actualizado_en = now()
      where fin_cartera.editado_a_mano = false
    returning 1
  )
  select count(*) into v_cob from up;

  -- Por pagar: el efectivo de sus órdenes.
  with up as (
    insert into fin_cartera (clase, contraparte, unidad_id, documento, fecha, motivo, monto, origen, origen_clave)
    select 'pagar', c.nombre, c.unidad_id, 'Efectivo de sus órdenes ' || to_char(c.periodo, 'YYYY-MM'), c.desde,
           'Cobrado contra entrega por nuestros mensajeros, a remitir', round(c.cobrado, 2), 'fulfillment',
           'ff-cod|' || c.unidad_id::text || '|' || to_char(c.periodo, 'YYYY-MM')
    from _ffcod c
    on conflict (origen_clave) do update set monto = excluded.monto, actualizado_en = now()
      where fin_cartera.editado_a_mano = false
    returning 1
  )
  select count(*) into v_pag from up;

  delete from fin_cartera d
  where d.origen = 'fulfillment' and d.editado_a_mano = false
    and not exists (select 1 from fin_cartera_abonos a where a.documento_id = d.id)
    and not exists (select 1 from _ff t where t.tarifa_total > 0 and d.origen_clave = 'fulfillment|' || t.unidad_id::text || '|' || to_char(t.periodo, 'YYYY-MM'))
    and not exists (select 1 from _ffcod c where d.origen_clave = 'ff-cod|' || c.unidad_id::text || '|' || to_char(c.periodo, 'YYYY-MM'))
    -- Solo lo de meses abiertos: lo de un mes cerrado no está en las tablas de arriba y no se toca.
    and not exists (select 1 from fin_cierres f where f.estado = 'cerrado' and to_char(f.periodo, 'YYYY-MM') = split_part(d.origen_clave, '|', 3));

  return query select v_ing, v_cob, v_pag;
end;
$$;
revoke all on function fin_sincronizar_fulfillment() from public, anon, authenticated;
comment on function fin_sincronizar_fulfillment() is 'Portal AF4 360°: tarifa de fulfillment (ingreso y por cobrar) y efectivo a remitir (por pagar) de los clientes de fulfillment.';
