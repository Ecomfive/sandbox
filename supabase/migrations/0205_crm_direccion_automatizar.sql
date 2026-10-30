-- CRM › Dirección, fase 4 (30 oct 2026, pedido de Hernán: automatizar). Solo lo usa Dirección; los chats no cambian.
--  * `crm_entregas(p_pais, p_dias)`: los pedidos del país de los últimos `p_dias` días por dropshipper (null si la cuenta no está vinculada) y
--    transportadora: entregados, devueltos, cancelados, con novedad y todavía en camino. De ahí sale la efectividad de entrega.
--  * `crm_automatizaciones`: los interruptores de Dirección. La única por ahora, «secuencia_alta», **empieza apagada**: al encenderla, a cada
--    dropshipper que se cree desde ese momento se le crean tareas de seguimiento el día 1, 3, 7 y 14 hasta su primer pedido (para quien lo
--    lleva o, si nadie, para la persona elegida). `crm_alta_pasos` guarda qué paso ya se creó a cada uno (no se repite).
--  * `tareas_dropshipper.origen` admite «alta».
-- RLS sin políticas (migración 0063): solo el servidor las toca. Reversa: supabase/rollbacks/0205_rollback.sql

create or replace function crm_entregas(p_pais uuid, p_dias integer default 60)
returns table (dropshipper_id uuid, transportadora text, pedidos integer, entregados integer, devueltos integer, cancelados integer, novedades integer, en_camino integer)
language sql stable as $$
  select c.dropshipper_id, coalesce(nullif(trim(o.transportadora), ''), 'Sin transportadora'),
    count(*)::integer,
    (count(*) filter (where crm_estado_grupo(o.estado) = 'entregado'))::integer,
    (count(*) filter (where crm_estado_grupo(o.estado) = 'devuelto'))::integer,
    (count(*) filter (where crm_estado_grupo(o.estado) = 'cancelado'))::integer,
    (count(*) filter (where upper(o.estado) like 'NOVEDAD%'))::integer,
    (count(*) filter (where crm_estado_grupo(o.estado) in ('despachado', 'pendiente')))::integer
  from crm_ordenes o
  left join dropshipper_cuentas c on c.plataforma_id = o.plataforma_id and c.pais_id = o.pais_id and c.id_externo = o.usuario_externo
  where o.pais_id = p_pais
    and o.fecha >= (now() at time zone 'America/Panama') - greatest(1, least(p_dias, 365)) * interval '1 day'
  group by 1, 2
$$;

create table if not exists crm_automatizaciones (
  clave text primary key check (clave in ('secuencia_alta')),
  encendida boolean not null default false,
  -- secuencia_alta: {"responsable_id": "<perfil>"} para los dropshippers que nadie lleva.
  config jsonb not null default '{}'::jsonb,
  encendida_en timestamptz,
  actualizado_por uuid references perfiles(id) on delete set null,
  actualizado_por_nombre text,
  actualizado_en timestamptz not null default now()
);
alter table crm_automatizaciones enable row level security;
insert into crm_automatizaciones (clave) values ('secuencia_alta') on conflict do nothing;

create table if not exists crm_alta_pasos (
  dropshipper_id uuid not null references dropshippers(id) on delete cascade,
  paso smallint not null check (paso in (1, 3, 7, 14)),
  -- null si el paso se saltó (se encendió tarde o ya había uno más nuevo pendiente).
  tarea_id uuid references tareas_dropshipper(id) on delete set null,
  creado_en timestamptz not null default now(),
  primary key (dropshipper_id, paso)
);
alter table crm_alta_pasos enable row level security;

alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_origen_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_origen_check check (origen in ('manual', 'escalado', 'chat', 'llegada', 'alerta', 'alta'));
