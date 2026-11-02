-- CRM › Dirección (30 oct 2026, pedido de Hernán: fase 1 del panel del CEO, módulo `crm-direccion`). La salud de cada dropshipper y las
-- alertas («Qué atender hoy») salen de sus pedidos de Dropi (`crm_ordenes` de sus cuentas vinculadas, sin cancelados):
--  * `crm_salud_dropshippers(p_pais)`: por dropshipper del país, sus pedidos de los últimos 14 y 30 días y de los 14 y 30 anteriores, el primer y
--    el último pedido y los entregados y devueltos de 60 días. El puntaje y las alertas se calculan en la app (src/lib/crm/salud.ts).
--  * `crm_pedidos_semanales(p_pais, p_semanas)`: los pedidos de la cartera por semana (lunes), para la gráfica.
--  * `crm_alertas_atendidas`: una alerta atendida (o pasada a tarea) no vuelve a salir hasta `hasta`, aunque siga igual.
--  * `tareas_dropshipper.origen` admite «alerta» (la tarea que se crea desde una alerta).
-- RLS sin políticas (migración 0063): solo el servidor las toca. Reversa: supabase/rollbacks/0197_rollback.sql

create or replace function crm_salud_dropshippers(p_pais uuid)
returns table (
  dropshipper_id uuid,
  pedidos_14 integer,
  pedidos_14_antes integer,
  pedidos_30 integer,
  pedidos_30_antes integer,
  primer_pedido date,
  ultimo_pedido date,
  entregados_60 integer,
  devueltos_60 integer
)
language sql stable as $$
  with hoy as (select (now() at time zone 'America/Panama')::date as d),
  pedidos as (
    select c.dropshipper_id, o.fecha::date as dia, crm_estado_grupo(o.estado) as grupo
    from crm_ordenes o
    join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
    where o.pais_id = p_pais and crm_estado_grupo(o.estado) <> 'cancelado'
  )
  select p.dropshipper_id,
    (count(*) filter (where p.dia > h.d - 14))::integer,
    (count(*) filter (where p.dia <= h.d - 14 and p.dia > h.d - 28))::integer,
    (count(*) filter (where p.dia > h.d - 30))::integer,
    (count(*) filter (where p.dia <= h.d - 30 and p.dia > h.d - 60))::integer,
    min(p.dia),
    max(p.dia),
    (count(*) filter (where p.dia > h.d - 60 and p.grupo = 'entregado'))::integer,
    (count(*) filter (where p.dia > h.d - 60 and p.grupo = 'devuelto'))::integer
  from pedidos p cross join hoy h
  group by p.dropshipper_id
$$;

create or replace function crm_pedidos_semanales(p_pais uuid, p_semanas integer default 8)
returns table (semana date, pedidos integer)
language sql stable as $$
  select date_trunc('week', o.fecha)::date, count(*)::integer
  from crm_ordenes o
  join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  where o.pais_id = p_pais
    and crm_estado_grupo(o.estado) <> 'cancelado'
    and o.fecha >= date_trunc('week', now() at time zone 'America/Panama') - (greatest(1, least(p_semanas, 26)) - 1) * interval '1 week'
  group by 1
  order by 1
$$;

create table if not exists crm_alertas_atendidas (
  id uuid primary key default gen_random_uuid(),
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  pais_id uuid not null references paises(id) on delete cascade,
  tipo text not null check (tipo in ('caida', 'dormido', 'devoluciones', 'sin_primer_pedido')),
  como text not null default 'atendida' check (como in ('atendida', 'tarea')),
  hasta date not null,
  tarea_id uuid references tareas_dropshipper(id) on delete set null,
  atendida_por uuid references perfiles(id) on delete set null,
  atendida_por_nombre text,
  atendida_en timestamptz not null default now()
);
create index if not exists crm_alertas_atendidas_pais on crm_alertas_atendidas (pais_id, hasta);
alter table crm_alertas_atendidas enable row level security;

alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_origen_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_origen_check check (origen in ('manual', 'escalado', 'chat', 'llegada', 'alerta'));
