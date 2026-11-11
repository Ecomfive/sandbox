-- Portal AF4 360°: Clientes y marketing (/clientes-marketing). Identidad de cliente sobre las órdenes de Ventas por
-- tienda (0122), recompra y cohortes, LTV por margen de contribución y CAC / ROAS / ROAS de margen por tienda y mes con
-- el marketing del EERR (0114, 0130).
--
--  * `cli_clientes`: una fila por persona. La llave es un HMAC del teléfono normalizado (o del correo) con un secreto
--    del servidor: aquí no queda ningún dato personal. Una orden sin teléfono ni correo válido es su propio cliente.
--    La llena «Recalcular clientes» (src/lib/clientes/identidad.ts + `cli_aplicar_identidades`); los totales los pone
--    `cli_cerrar_recalculo`.
--  * `cli_cliente_ordenes`: orden → cliente, con la calidad del teléfono de esa orden.
--  * `cli_ordenes_margen`: cada orden con su margen de contribución (ventas entregadas − costo de la mercancía − envío),
--    con las mismas reglas de costo que `ven_resumen_mensual` (costo vigente o el de la Matriz; el envío se paga aunque
--    la orden se devuelva).
--  * `cli_resumen_mensual()`, `cli_cohortes()`, `cli_curva_cohortes()`, `cli_frecuencia()`: por «ámbito» (`todas` o el id
--    de una tienda). En una tienda, el cliente nace con su primera entrega en esa tienda.
--    Un cliente es quien tiene al menos una orden entregada; su cohorte es el mes de su primera entrega; recompra es
--    otra entrega en un día posterior.
--  * `cli_marketing_mensual`: gasto de marketing del EERR por tienda, mes y plataforma (la regla de la plataforma vive
--    también en `plataformaDeTipo`, src/lib/clientes/metricas.ts: si cambias una, cambia la otra).
--
-- RLS activado y sin políticas (SEGURIDAD.md). Vistas con `security_invoker = true`; las funciones solo las llama el
-- servidor. Se puede correr dos veces.

create table if not exists cli_clientes (
  id uuid primary key default gen_random_uuid(),
  llave text not null unique,
  tipo_llave text not null check (tipo_llave in ('telefono', 'correo', 'orden')),
  primera_orden date,
  ultima_orden date,
  primera_entrega date,
  ultima_entrega date,
  ordenes integer not null default 0,
  entregadas integer not null default 0,
  ventas_entregadas numeric(14, 2) not null default 0,
  margen numeric(14, 2) not null default 0,
  tiendas uuid[] not null default '{}',
  recalculo uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists cli_clientes_primera on cli_clientes (primera_entrega);

create table if not exists cli_cliente_ordenes (
  orden_id uuid primary key references ven_ordenes(id) on delete cascade,
  cliente_id uuid not null references cli_clientes(id) on delete cascade,
  calidad text not null check (calidad in ('movil', 'fijo', 'invalido', 'sospechoso', 'sin_dato')),
  recalculo uuid
);
create index if not exists cli_cliente_ordenes_cliente on cli_cliente_ordenes (cliente_id);

alter table cli_clientes enable row level security;
alter table cli_cliente_ordenes enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Recalcular: aplicar un lote de llaves y cerrar
-- ---------------------------------------------------------------------------------------------
-- p_filas: [{ orden_id, llave, tipo_llave, calidad }]. Crea o marca los clientes y apunta cada orden a su cliente.
create or replace function cli_aplicar_identidades(p_recalculo uuid, p_filas jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  insert into cli_clientes (llave, tipo_llave, recalculo)
  select distinct on (f.llave) f.llave, f.tipo_llave, p_recalculo
  from jsonb_to_recordset(p_filas) as f(orden_id uuid, llave text, tipo_llave text, calidad text)
  join ven_ordenes o on o.id = f.orden_id
  order by f.llave
  on conflict (llave) do update set tipo_llave = excluded.tipo_llave, recalculo = excluded.recalculo;

  insert into cli_cliente_ordenes (orden_id, cliente_id, calidad, recalculo)
  select f.orden_id, c.id, f.calidad, p_recalculo
  from jsonb_to_recordset(p_filas) as f(orden_id uuid, llave text, tipo_llave text, calidad text)
  join ven_ordenes o on o.id = f.orden_id
  join cli_clientes c on c.llave = f.llave
  on conflict (orden_id) do update
    set cliente_id = excluded.cliente_id, calidad = excluded.calidad, recalculo = excluded.recalculo;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Quita lo que el recálculo ya no vio (clientes sin órdenes, órdenes que no estaban) y rehace los totales.
create or replace function cli_cerrar_recalculo(p_recalculo uuid)
returns table (clientes bigint, ordenes bigint)
language plpgsql
set search_path = public
as $$
begin
  delete from cli_cliente_ordenes where recalculo is distinct from p_recalculo;
  delete from cli_clientes c where c.recalculo is distinct from p_recalculo
    or not exists (select 1 from cli_cliente_ordenes x where x.cliente_id = c.id);

  update cli_clientes c set
    primera_orden = t.primera_orden,
    ultima_orden = t.ultima_orden,
    primera_entrega = t.primera_entrega,
    ultima_entrega = t.ultima_entrega,
    ordenes = t.ordenes,
    entregadas = t.entregadas,
    ventas_entregadas = t.ventas,
    margen = t.margen,
    tiendas = t.tiendas,
    actualizado_en = now()
  from (
    select m.cliente_id,
      min(m.fecha) as primera_orden,
      max(m.fecha) as ultima_orden,
      min(m.fecha) filter (where m.entregada) as primera_entrega,
      max(m.fecha) filter (where m.entregada) as ultima_entrega,
      count(*)::integer as ordenes,
      count(*) filter (where m.entregada)::integer as entregadas,
      round(sum(m.ventas), 2) as ventas,
      round(sum(m.margen), 2) as margen,
      array_agg(distinct m.unidad_id) as tiendas
    from cli_ordenes_margen m
    where m.cliente_id is not null
    group by m.cliente_id
  ) t
  where t.cliente_id = c.id;

  return query select (select count(*) from cli_clientes), (select count(*) from cli_cliente_ordenes);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Cada orden con su margen de contribución
-- ---------------------------------------------------------------------------------------------
create or replace view cli_ordenes_margen
with (security_invoker = true) as
with costo as (
  select orden_id, sum(costo) as costo from ven_lineas_costo group by orden_id
)
select
  o.id as orden_id,
  co.cliente_id,
  co.calidad,
  o.unidad_id,
  o.fecha,
  o.periodo,
  o.estado_entrega,
  o.estado_entrega = 'entregada' as entregada,
  case when o.estado_entrega = 'entregada' then o.total else 0 end as ventas,
  case when o.estado_entrega = 'entregada' then coalesce(c.costo, 0) else 0 end as costo_mercancia,
  o.costo_envio,
  (case when o.estado_entrega = 'entregada' then o.total - coalesce(c.costo, 0) else 0 end) - o.costo_envio as margen
from ven_ordenes o
left join cli_cliente_ordenes co on co.orden_id = o.id
left join costo c on c.orden_id = o.id;

-- ---------------------------------------------------------------------------------------------
-- Por ámbito y mes: clientes nuevos y recurrentes, ventas y margen
-- ---------------------------------------------------------------------------------------------
create or replace function cli_resumen_mensual()
returns table (
  ambito text,
  periodo date,
  ordenes bigint,
  entregadas bigint,
  ordenes_sin_cliente bigint,
  compradores bigint,
  nuevos bigint,
  recurrentes bigint,
  ventas numeric,
  costo_mercancia numeric,
  costo_envio numeric,
  margen numeric
)
language sql stable
set search_path = public
as $$
  with om as (select * from cli_ordenes_margen),
  amb as (
    select 'todas'::text as ambito, * from om
    union all
    select unidad_id::text, * from om
  ),
  primera as (
    select a.ambito, a.cliente_id, min(a.fecha) as f1
    from amb a where a.entregada and a.cliente_id is not null
    group by 1, 2
  )
  select
    a.ambito,
    a.periodo,
    count(*),
    count(*) filter (where a.entregada),
    count(*) filter (where a.cliente_id is null),
    count(distinct a.cliente_id) filter (where a.entregada),
    count(distinct a.cliente_id) filter (where a.entregada and date_trunc('month', p.f1) = a.periodo),
    count(distinct a.cliente_id) filter (where a.entregada and p.f1 < a.periodo),
    round(sum(a.ventas), 2),
    round(sum(a.costo_mercancia), 2),
    round(sum(a.costo_envio), 2),
    round(sum(a.margen), 2)
  from amb a
  left join primera p on p.ambito = a.ambito and p.cliente_id = a.cliente_id
  group by a.ambito, a.periodo
  order by a.ambito, a.periodo
$$;

-- ---------------------------------------------------------------------------------------------
-- Cohortes por mes de la primera entrega: recompra a 30/60/90/180 días y LTV a 90/180/365 días
-- ---------------------------------------------------------------------------------------------
-- «Maduros a N días»: clientes cuya primera entrega fue hace N días o más (al corte = última orden cargada). Las tasas y
-- el LTV a N días se calculan solo sobre ellos. El LTV suma el margen de todas sus órdenes en la tienda (también el envío
-- de las que no se entregaron) desde la primera entrega y durante N días.
create or replace function cli_cohortes(p_corte date default null)
returns table (
  ambito text,
  cohorte date,
  clientes bigint,
  maduros_30 bigint,
  maduros_60 bigint,
  maduros_90 bigint,
  maduros_180 bigint,
  maduros_365 bigint,
  recompra_30 bigint,
  recompra_60 bigint,
  recompra_90 bigint,
  recompra_180 bigint,
  ltv_90 numeric,
  ltv_180 numeric,
  ltv_365 numeric,
  entregadas bigint,
  margen numeric,
  dias_segunda numeric,
  con_segunda bigint
)
language sql stable
set search_path = public
as $$
  with corte as (select coalesce(p_corte, (select max(fecha) from ven_ordenes)) as dia),
  om as (select * from cli_ordenes_margen where cliente_id is not null),
  amb as (
    select 'todas'::text as ambito, cliente_id, fecha, entregada, margen from om
    union all
    select unidad_id::text, cliente_id, fecha, entregada, margen from om
  ),
  primera as (
    select ambito, cliente_id, min(fecha) as f1 from amb where entregada group by 1, 2
  ),
  porcliente as (
    select
      p.ambito,
      p.cliente_id,
      p.f1,
      min(a.fecha) filter (where a.entregada and a.fecha > p.f1) as f2,
      count(*) filter (where a.entregada) as entregadas,
      coalesce(sum(a.margen), 0) as margen,
      coalesce(sum(a.margen) filter (where a.fecha < p.f1 + 90), 0) as m90,
      coalesce(sum(a.margen) filter (where a.fecha < p.f1 + 180), 0) as m180,
      coalesce(sum(a.margen) filter (where a.fecha < p.f1 + 365), 0) as m365
    from primera p
    join amb a on a.ambito = p.ambito and a.cliente_id = p.cliente_id and a.fecha >= p.f1
    group by p.ambito, p.cliente_id, p.f1
  )
  select
    x.ambito,
    date_trunc('month', x.f1)::date,
    count(*),
    count(*) filter (where x.f1 + 30 <= c.dia),
    count(*) filter (where x.f1 + 60 <= c.dia),
    count(*) filter (where x.f1 + 90 <= c.dia),
    count(*) filter (where x.f1 + 180 <= c.dia),
    count(*) filter (where x.f1 + 365 <= c.dia),
    count(*) filter (where x.f1 + 30 <= c.dia and x.f2 <= x.f1 + 30),
    count(*) filter (where x.f1 + 60 <= c.dia and x.f2 <= x.f1 + 60),
    count(*) filter (where x.f1 + 90 <= c.dia and x.f2 <= x.f1 + 90),
    count(*) filter (where x.f1 + 180 <= c.dia and x.f2 <= x.f1 + 180),
    round(coalesce(sum(x.m90) filter (where x.f1 + 90 <= c.dia), 0), 2),
    round(coalesce(sum(x.m180) filter (where x.f1 + 180 <= c.dia), 0), 2),
    round(coalesce(sum(x.m365) filter (where x.f1 + 365 <= c.dia), 0), 2),
    sum(x.entregadas)::bigint,
    round(sum(x.margen), 2),
    coalesce(sum(x.f2 - x.f1), 0)::numeric,
    count(x.f2)
  from porcliente x
  cross join corte c
  group by x.ambito, date_trunc('month', x.f1)
  order by 1, 2
$$;

-- Por cohorte y mes desde la primera entrega (0 = el mismo mes, hasta 12): clientes que volvieron a recibir y margen
-- del mes. `completo` dice si ese mes ya terminó al corte.
create or replace function cli_curva_cohortes(p_corte date default null)
returns table (ambito text, cohorte date, mes integer, activos bigint, margen numeric, completo boolean)
language sql stable
set search_path = public
as $$
  with corte as (select coalesce(p_corte, (select max(fecha) from ven_ordenes)) as dia),
  om as (select * from cli_ordenes_margen where cliente_id is not null),
  amb as (
    select 'todas'::text as ambito, cliente_id, fecha, periodo, entregada, margen from om
    union all
    select unidad_id::text, cliente_id, fecha, periodo, entregada, margen from om
  ),
  primera as (
    select ambito, cliente_id, min(fecha) as f1 from amb where entregada group by 1, 2
  ),
  meses as (
    select
      p.ambito,
      date_trunc('month', p.f1)::date as cohorte,
      ((extract(year from a.periodo) - extract(year from p.f1)) * 12 + extract(month from a.periodo) - extract(month from p.f1))::integer as mes,
      a.cliente_id,
      a.entregada,
      a.margen
    from primera p
    join amb a on a.ambito = p.ambito and a.cliente_id = p.cliente_id and a.fecha >= p.f1
  )
  select
    m.ambito,
    m.cohorte,
    m.mes,
    count(distinct m.cliente_id) filter (where m.entregada),
    round(sum(m.margen), 2),
    (m.cohorte + make_interval(months => m.mes + 1) - interval '1 day')::date <= (select dia from corte)
  from meses m
  where m.mes between 0 and 12
  group by m.ambito, m.cohorte, m.mes
  order by 1, 2, 3
$$;

-- Cuántos clientes tienen 1, 2, 3, 4 o 5+ entregas, y los días entre la primera y la última entrega de quienes volvieron
-- (para el tiempo medio entre compras: días ÷ intervalos, contando días de entrega distintos).
create or replace function cli_frecuencia()
returns table (ambito text, entregas integer, clientes bigint, dias numeric, intervalos bigint)
language sql stable
set search_path = public
as $$
  with om as (select * from cli_ordenes_margen where cliente_id is not null and entregada),
  amb as (
    select 'todas'::text as ambito, cliente_id, fecha from om
    union all
    select unidad_id::text, cliente_id, fecha from om
  ),
  porcliente as (
    select ambito, cliente_id, count(*) as n, count(distinct fecha) as dias_distintos, max(fecha) - min(fecha) as dias
    from amb group by 1, 2
  )
  select ambito, least(n, 5)::integer, count(*), coalesce(sum(dias), 0)::numeric, coalesce(sum(dias_distintos - 1), 0)::bigint
  from porcliente
  group by 1, 2
  order by 1, 2
$$;

-- Calidad de la identidad: órdenes por calidad del teléfono, clientes por tipo de llave y órdenes sin cliente todavía.
create or replace function cli_calidad()
returns table (grupo text, clave text, n bigint)
language sql stable
set search_path = public
as $$
  select 'calidad', calidad, count(*) from cli_cliente_ordenes group by calidad
  union all
  select 'tipo', tipo_llave, count(*) from cli_clientes group by tipo_llave
  union all
  select 'tipo_con_entrega', tipo_llave, count(*) from cli_clientes where entregadas > 0 group by tipo_llave
  union all
  select 'sin_cliente', '', count(*) from ven_ordenes o where not exists (select 1 from cli_cliente_ordenes c where c.orden_id = o.id)
$$;

-- ---------------------------------------------------------------------------------------------
-- Gasto de marketing por tienda, mes y plataforma (del EERR, con A DISTRIBUIR ya repartido)
-- ---------------------------------------------------------------------------------------------
create or replace view cli_marketing_mensual
with (security_invoker = true) as
select
  e.periodo,
  e.unidad_id,
  case
    when t.nombre ilike '%facebook%' or t.nombre ilike '%meta%' or t.nombre ilike '%instagram%' then 'meta'
    when t.nombre ilike '%tiktok%' then 'tiktok'
    when t.nombre ilike '%google%' then 'google'
    when t.nombre ilike '%offline%' then 'offline'
    else 'otros'
  end as plataforma,
  round(-sum(e.monto * e.signo), 2) as gasto
from fin_eerr_mensual e
join fin_tipos t on t.id = e.tipo_id
where e.seccion = 'marketing'
group by 1, 2, 3;

-- Meses que el libro ya tiene (con ingresos en el EERR): sin libro no hay gasto de marketing que comparar.
create or replace function cli_meses_libro()
returns table (periodo date)
language sql stable
set search_path = public
as $$
  select e.periodo from fin_eerr_mensual e where e.seccion = 'ingresos' and e.signo > 0 group by e.periodo having sum(e.monto) > 0 order by 1
$$;

comment on table cli_clientes is 'Portal AF4 360°: clientes de las tiendas (llave = HMAC del teléfono o correo; sin datos personales).';
comment on table cli_cliente_ordenes is 'Portal AF4 360°: orden → cliente, con la calidad del teléfono de la orden.';
comment on view cli_ordenes_margen is 'Portal AF4 360°: cada orden con su margen de contribución (ventas entregadas − mercancía − envío).';
comment on view cli_marketing_mensual is 'Portal AF4 360°: gasto de marketing del EERR por tienda, mes y plataforma.';

revoke all on function cli_aplicar_identidades(uuid, jsonb) from public;
revoke all on function cli_cerrar_recalculo(uuid) from public;
revoke all on function cli_resumen_mensual() from public;
revoke all on function cli_cohortes(date) from public;
revoke all on function cli_curva_cohortes(date) from public;
revoke all on function cli_frecuencia() from public;
revoke all on function cli_calidad() from public;
revoke all on function cli_meses_libro() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function cli_aplicar_identidades(uuid, jsonb) from anon, authenticated';
    execute 'revoke all on function cli_cerrar_recalculo(uuid) from anon, authenticated';
    execute 'revoke all on function cli_resumen_mensual() from anon, authenticated';
    execute 'revoke all on function cli_cohortes(date) from anon, authenticated';
    execute 'revoke all on function cli_curva_cohortes(date) from anon, authenticated';
    execute 'revoke all on function cli_frecuencia() from anon, authenticated';
    execute 'revoke all on function cli_calidad() from anon, authenticated';
    execute 'revoke all on function cli_meses_libro() from anon, authenticated';
  end if;
end $$;

-- Permiso: lo recibe quien ya tiene Ventas por tienda, con su mismo solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'clientes-marketing', solo_lectura
from permisos_rol
where modulo = 'ventas-tiendas'
on conflict (rol_id, modulo) do nothing;
