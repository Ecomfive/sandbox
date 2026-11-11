-- Portal AF4 360°: Tesorería (/tesoreria, ver FINANZAS-360.md). Junta lo que mueve la caja del día a día: saldos bancarios
-- diarios, posición de caja, calendario y programación de pagos con aprobación, costos de cobrar, efectivo de
-- repartidores, seguimiento del saldo de Dropi. La lógica vive en `src/lib/finanzas/tesoreria.ts` y `pagos.ts`.
--
--  * `fin_saldos_bancarios`: saldo de una cuenta en un día cargado a mano (no hay API de bancos). Se junta con el último
--    saldo de cada día de los extractos de Conciliación en la vista `fin_saldos_cuentas_diarios` (manda lo cargado a mano
--    si los dos dicen algo el mismo día).
--  * `fin_pago_prioridades`: crítico / negociable / postergable por categoría de pago (nómina, impuestos, cuentas por
--    pagar…) o por proveedor. Sin regla, cada categoría tiene la suya por defecto (en el código).
--  * `fin_pagos_programados`: un pago solicitado → aprobado → pagado (o rechazado / anulado), con quién y cuándo. Al
--    marcarlo pagado se puede crear su movimiento en el libro (`movimiento_id`) y, si viene de una cuenta por pagar, su
--    abono (`abono_id`).
--  * Funciones de solo lectura que agregan en Postgres:
--    - `fin_tesoreria_comisiones(desde)`: comisiones por mes desde el libro (tipos de comisión o cargos bancarios), desde
--      las líneas del banco (comisión bancaria / de Yappy) y desde las pasarelas (Yappy, MiPOS, Servientrega).
--    - `fin_tesoreria_costo_cobro(desde)`: ventas entregadas por mes y método de pago, y lo que cobró cada pasarela.
--    - `fin_tesoreria_depositos(desde)`: por repartidor y semana de cierre, el efectivo que cobró, lo que llegó al banco
--      (parejas confirmadas de la conciliación), lo compensado en su cierre y la rendición del recibo.
--    - `fin_tesoreria_por_liquidar(días)`: cobros de las pasarelas que todavía no llegaron al banco.
--    - `fin_dropi_transito(país)`: pedidos de Dropi despachados sin entregar ni devolver (últimos 60 días) por fecha.
--    - `fin_dropi_historia(país, días)`: entregados y devueltos de una ventana ya resuelta, con la ganancia que registró
--      Dropi en la cartera y cuántos días tardó.
--  * Ajustes en `fin_config` (0130), clave `tesoreria`: umbral y días del retiro de Dropi, días del efectivo de
--    repartidores, días para dar por viejo un saldo bancario, aviso de renovación de una línea de crédito.
--
-- RLS activado y sin políticas (SEGURIDAD.md); las vistas con `security_invoker = true`; las funciones solo las llama el
-- servidor. Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- Saldos bancarios diarios
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_saldos_bancarios (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references fin_cuentas(id),
  fecha date not null,
  saldo numeric(14, 2) not null,
  nota text check (nota is null or length(nota) <= 500),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (cuenta_id, fecha)
);
alter table fin_saldos_bancarios enable row level security;

create index if not exists conc_lineas_saldo_dia on conc_lineas (cuenta_id, fecha) where saldo is not null;

-- El saldo de cada cuenta al final de cada día que tiene dato: el de la última línea del extracto de ese día (como
-- `conc_resumen_mensual`) o el cargado a mano (manda).
create or replace view fin_saldos_cuentas_diarios
with (security_invoker = true) as
with extracto as (
  select distinct on (l.cuenta_id, l.fecha) l.cuenta_id, l.fecha, l.saldo
  from conc_lineas l
  where l.saldo is not null
  order by l.cuenta_id, l.fecha, l.orden desc, l.id desc
)
select m.cuenta_id, m.fecha, m.saldo, 'manual'::text as origen
from fin_saldos_bancarios m
union all
select e.cuenta_id, e.fecha, e.saldo, 'extracto'::text
from extracto e
where not exists (select 1 from fin_saldos_bancarios m where m.cuenta_id = e.cuenta_id and m.fecha = e.fecha);

-- ---------------------------------------------------------------------------------------------
-- Prioridades y programación de pagos
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_pago_prioridades (
  id uuid primary key default gen_random_uuid(),
  -- categoria: nomina, impuesto, cxp, compra, recurrente, prestamo, linea, otro · contraparte: el proveedor tal como
  -- aparece en la cuenta por pagar o en el pago.
  ambito text not null check (ambito in ('categoria', 'contraparte')),
  valor text not null check (length(btrim(valor)) between 1 and 160),
  prioridad text not null check (prioridad in ('critico', 'negociable', 'postergable')),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists fin_pago_prioridades_unica on fin_pago_prioridades (ambito, upper(btrim(valor)));
alter table fin_pago_prioridades enable row level security;

create table if not exists fin_pagos_programados (
  id uuid primary key default gen_random_uuid(),
  concepto text not null check (length(btrim(concepto)) between 1 and 160),
  contraparte text check (contraparte is null or length(contraparte) <= 160),
  categoria text not null default 'otro' check (categoria in ('nomina', 'impuesto', 'cxp', 'compra', 'recurrente', 'prestamo', 'linea', 'otro')),
  monto numeric(14, 2) not null check (monto > 0),
  fecha_programada date not null,
  prioridad text not null default 'negociable' check (prioridad in ('critico', 'negociable', 'postergable')),
  -- De dónde salió (una cuenta por pagar, la cuota de un préstamo «<id>:<n>»…), para no programarlo dos veces.
  origen_ref text check (origen_ref is null or length(origen_ref) <= 120),
  cartera_id uuid references fin_cartera(id) on delete set null,
  -- Con qué se registra en el libro al pagarlo (sugerido; se puede cambiar al pagar).
  tipo_id uuid references fin_tipos(id),
  unidad_id uuid references fin_unidades(id),
  cuenta_id uuid references fin_cuentas(id),
  estado text not null default 'solicitado' check (estado in ('solicitado', 'aprobado', 'pagado', 'rechazado', 'anulado')),
  nota text check (nota is null or length(nota) <= 2000),
  solicitado_por uuid references auth.users(id),
  solicitado_en timestamptz not null default now(),
  aprobado_por uuid references auth.users(id),
  aprobado_en timestamptz,
  rechazado_por uuid references auth.users(id),
  rechazado_en timestamptz,
  motivo_rechazo text check (motivo_rechazo is null or length(motivo_rechazo) <= 500),
  pagado_por uuid references auth.users(id),
  pagado_en timestamptz,
  fecha_pago date,
  referencia_pago text check (referencia_pago is null or length(referencia_pago) <= 120),
  movimiento_id uuid references fin_movimientos(id) on delete set null,
  abono_id uuid references fin_cartera_abonos(id) on delete set null,
  actualizado_en timestamptz not null default now(),
  check (estado <> 'aprobado' or aprobado_en is not null),
  check (estado <> 'pagado' or (aprobado_en is not null and fecha_pago is not null)),
  check (estado <> 'rechazado' or coalesce(btrim(motivo_rechazo), '') <> '')
);
create index if not exists fin_pagos_programados_estado on fin_pagos_programados (estado, fecha_programada);
-- Lo mismo (una cuenta por pagar, una cuota) no se programa dos veces mientras siga vivo.
create unique index if not exists fin_pagos_programados_origen on fin_pagos_programados (origen_ref)
  where origen_ref is not null and estado in ('solicitado', 'aprobado');
alter table fin_pagos_programados enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Comisiones bancarias y de pasarela por mes
-- ---------------------------------------------------------------------------------------------
create or replace function fin_tesoreria_comisiones(p_desde date)
returns table (mes date, fuente text, concepto text, monto numeric)
language sql stable
set search_path = public
as $$
  select m.periodo, 'libro'::text, t.nombre, round(sum(m.monto), 2)
  from fin_movimientos m
  join fin_tipos t on t.id = m.tipo_id
  where m.periodo >= date_trunc('month', p_desde)::date
    and t.signo = -1
    and t.nombre ~* '(comisi|cargos? banc|gastos? banc|pasarela|merchant)'
  group by 1, 2, 3
  union all
  select date_trunc('month', l.fecha)::date, 'banco'::text, l.clase, round(-sum(l.monto), 2)
  from conc_lineas l
  where l.fecha >= date_trunc('month', p_desde)::date
    and l.clase in ('comision_bancaria', 'comision_yappy')
    and l.monto < 0
    and l.estado <> 'ignorada'
  group by 1, 2, 3
  union all
  select date_trunc('month', f.fecha)::date, 'pasarela'::text, f.fuente, round(sum(f.comision), 2)
  from conc_fuentes_cobro f
  where f.fecha >= date_trunc('month', p_desde)::date
    and not f.anulada
    and f.comision <> 0
  group by 1, 2, 3
$$;

-- Ventas entregadas por mes (de la fecha de envío: el día en que se cobra) y método de pago, y lo que se quedó cada
-- pasarela por mes (tarjeta = MiPOS; la comisión de Yappy también como la cobra el banco, `yappy_banco`).
create or replace function fin_tesoreria_costo_cobro(p_desde date)
returns table (mes date, metodo text, ordenes bigint, ventas numeric, comision numeric)
language sql stable
set search_path = public
as $$
  select date_trunc('month', coalesce(o.fecha_envio, o.fecha))::date, coalesce(o.metodo_pago, 'otro'), count(*), round(sum(o.total), 2), 0::numeric
  from ven_ordenes o
  where o.estado_entrega = 'entregada'
    and coalesce(o.fecha_envio, o.fecha) >= date_trunc('month', p_desde)::date
  group by 1, 2
  union all
  select date_trunc('month', f.fecha)::date, case f.fuente when 'mipos' then 'tarjeta' else f.fuente end, 0::bigint, 0::numeric, round(sum(f.comision), 2)
  from conc_fuentes_cobro f
  where not f.anulada and f.fecha >= date_trunc('month', p_desde)::date
  group by 1, 2
  union all
  select date_trunc('month', l.fecha)::date, 'yappy_banco'::text, 0::bigint, 0::numeric, round(-sum(l.monto), 2)
  from conc_lineas l
  where l.clase = 'comision_yappy' and l.monto < 0 and l.estado <> 'ignorada' and l.fecha >= date_trunc('month', p_desde)::date
  group by 1, 2
$$;

-- ---------------------------------------------------------------------------------------------
-- Efectivo de repartidores: lo cobrado frente a lo depositado
-- ---------------------------------------------------------------------------------------------
create or replace function fin_tesoreria_depositos(p_desde date)
returns table (
  repartidor_id uuid,
  semana date,
  primera_fecha date,
  cobrado_efectivo numeric,
  depositado_banco numeric,
  cierre_estado text,
  a_pagar numeric,
  adelantos numeric,
  descuentos numeric,
  rendicion_recibo numeric
)
language sql stable
set search_path = public
as $$
  select
    s.repartidor_id,
    s.semana,
    coalesce((select min(o.fecha) from del_efectivo_ordenes o where o.repartidor_id = s.repartidor_id and o.semana = s.semana), s.semana),
    s.cobrado_efectivo,
    round(
      coalesce((
        select sum(p.monto)
        from conc_pares p
        join conc_lineas l on l.id = p.linea_id
        where p.estado = 'confirmado' and p.clase = 'delivery' and p.del_repartidor_id = s.repartidor_id and p.del_semana = s.semana and l.monto > 0
      ), 0)
      + coalesce((
        select sum(p.monto)
        from conc_pares p
        join conc_lineas l on l.id = p.linea_id
        join del_efectivo_ordenes o on o.orden_id = p.orden_id
        where p.estado = 'confirmado' and p.clase = 'orden' and p.orden_fuente = 'ven_ordenes'
          and o.repartidor_id = s.repartidor_id and o.semana = s.semana and l.monto > 0
      ), 0),
      2
    ),
    k.estado,
    k.a_pagar,
    coalesce(k.adelantos, 0),
    coalesce(k.descuentos, 0),
    (select r.monto from del_recibos r where r.cierre_id = k.id and r.tipo = 'rendicion')
  from del_semanas s
  left join del_cierres k on k.repartidor_id = s.repartidor_id and k.semana = s.semana
  where s.semana >= p_desde
    and s.cobrado_efectivo > 0
$$;

-- Cobros de las pasarelas (Yappy, MiPOS, Servientrega) de los últimos `p_dias` que ninguna línea del banco tiene
-- confirmados: lo que todavía no llegó a la cuenta.
create or replace function fin_tesoreria_por_liquidar(p_dias integer default 60)
returns table (fuente text, cobros bigint, neto numeric, ultima date)
language sql stable
set search_path = public
as $$
  select f.fuente, count(*), round(sum(f.neto), 2), max(f.fecha)
  from conc_fuentes_cobro f
  where not f.anulada
    and f.fecha > (now() at time zone 'America/Panama')::date - greatest(p_dias, 1)
    and not exists (select 1 from conc_pares p where p.cobro_id = f.id and p.estado = 'confirmado')
  group by f.fuente
$$;

-- ---------------------------------------------------------------------------------------------
-- Dropi: pedidos en tránsito e historia de entrega
-- ---------------------------------------------------------------------------------------------
create or replace function fin_dropi_transito(p_pais text default 'PA')
returns table (fecha date, pedidos bigint, monto numeric)
language sql stable
set search_path = public
as $$
  select o.fecha, count(*), round(sum(o.monto), 2)
  from ordenes o
  join paises pa on pa.id = o.pais_id and pa.codigo = p_pais
  join plataformas pl on pl.id = o.plataforma_id and pl.nombre ilike 'dropi%'
  where crm_estado_grupo(o.estado) = 'despachado'
    and o.fecha >= (now() at time zone 'America/Panama')::date - 60
  group by o.fecha
$$;

-- Una ventana ya resuelta (termina 15 días antes de hoy): entregados, devueltos y, de los entregados, la ganancia que
-- Dropi registró en la cartera (`historial_cartera`, descripción con «ganancia») y en cuántos días.
create or replace function fin_dropi_historia(p_pais text default 'PA', p_dias integer default 90)
returns table (entregados bigint, devueltos bigint, monto_entregados numeric, con_ganancia bigint, monto_con_ganancia numeric, ganancia numeric, dias_a_ganancia numeric)
language sql stable
set search_path = public
as $$
  with o as (
    select o.*, crm_estado_grupo(o.estado) as grupo
    from ordenes o
    join paises pa on pa.id = o.pais_id and pa.codigo = p_pais
    join plataformas pl on pl.id = o.plataforma_id and pl.nombre ilike 'dropi%'
    where o.fecha between (now() at time zone 'America/Panama')::date - 15 - greatest(p_dias, 7)
                      and (now() at time zone 'America/Panama')::date - 15
  ),
  g as (
    select o.id, o.monto, o.fecha, x.ganancia, x.fecha_ganancia
    from o
    cross join lateral (
      select sum(c.monto) as ganancia, min(c.fecha) as fecha_ganancia
      from historial_cartera c
      where c.pais_id = o.pais_id and c.plataforma_id = o.plataforma_id
        and c.orden_referencia_externa = o.referencia_externa
        and c.descripcion ilike '%ganancia%'
    ) x
    where o.grupo = 'entregado'
  )
  select
    (select count(*) from o where grupo = 'entregado'),
    (select count(*) from o where grupo = 'devuelto'),
    (select round(coalesce(sum(monto), 0), 2) from o where grupo = 'entregado'),
    (select count(*) from g where ganancia is not null),
    (select round(coalesce(sum(monto), 0), 2) from g where ganancia is not null),
    (select round(coalesce(sum(ganancia), 0), 2) from g where ganancia is not null),
    (select round(avg(greatest(fecha_ganancia - fecha, 0)), 1) from g where ganancia is not null)
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'fin_tesoreria_comisiones(date)',
    'fin_tesoreria_costo_cobro(date)',
    'fin_tesoreria_depositos(date)',
    'fin_tesoreria_por_liquidar(integer)',
    'fin_dropi_transito(text)',
    'fin_dropi_historia(text, integer)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
  end loop;
end $$;

comment on table fin_saldos_bancarios is 'Portal AF4 360°: saldo de una cuenta en un día, cargado a mano en Tesorería.';
comment on view fin_saldos_cuentas_diarios is 'Portal AF4 360°: saldo de cada cuenta por día (extracto de Conciliación o carga manual, manda la manual).';
comment on table fin_pago_prioridades is 'Portal AF4 360°: crítico / negociable / postergable por categoría de pago o proveedor.';
comment on table fin_pagos_programados is 'Portal AF4 360°: pagos solicitados, aprobados y pagados (Tesorería › Pagos).';

-- ---------------------------------------------------------------------------------------------
-- Permiso: lo recibe quien ya tiene el Libro de movimientos, con su mismo solo lectura.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'tesoreria', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
