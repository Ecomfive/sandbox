-- Panel del repartidor (24 nov 2026, pedido de Hernán; prototipo aprobado https://claude.ai/artifact/TyFwhvTgvLJjsN6cM5GyEc): cada delivery tiene su
-- propia entrada (/repartidor, aparte del sistema, como el portal de Shen Zhen) con su ruta del día, y lo que marca escribe directo en la fila de
-- Despacho ciudad (`mon_despachos`), así Soporte lo ve al instante y Monday deja de hacer falta.
--   * `despacho_repartidores`: las cuentas (un usuario de acceso sin perfil del equipo, unido a su nombre de repartidor en Despacho ciudad).
--   * `mon_despachos`: desde dónde y cuándo se marcó (y la ubicación), el número de comprobante y para cuándo se reprogramó un pospuesto.
--   * `despacho_cierres`: el cierre del día de cada repartidor (lo cobrado, el efectivo por tienda con la foto de cada depósito y su pago de envíos),
--     que Soporte valida o devuelve con una nota.
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0362_rollback.sql
create table if not exists despacho_repartidores (
  id uuid primary key default uuid_v7(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  courier text not null check (char_length(courier) between 1 and 80),
  nombre text not null check (char_length(nombre) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254),
  activo boolean not null default true,
  ultimo_ingreso_en timestamptz,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);
alter table despacho_repartidores enable row level security;

alter table mon_despachos add column if not exists marcado_desde text check (marcado_desde is null or marcado_desde = 'panel');
alter table mon_despachos add column if not exists marcado_en timestamptz;
alter table mon_despachos add column if not exists marcado_lat double precision;
alter table mon_despachos add column if not exists marcado_lng double precision;
alter table mon_despachos add column if not exists comprobante_numero text check (comprobante_numero is null or char_length(comprobante_numero) <= 40);
alter table mon_despachos add column if not exists reprogramado_para date;

create table if not exists despacho_cierres (
  id uuid primary key default uuid_v7(),
  courier text not null check (char_length(courier) between 1 and 80),
  dia date not null,
  repartidor_id uuid references despacho_repartidores(id) on delete set null,
  estado text not null default 'enviado' check (estado in ('enviado', 'validado', 'devuelto')),
  resumen jsonb not null default '{}'::jsonb,
  depositos jsonb not null default '[]'::jsonb,
  nota text check (nota is null or char_length(nota) <= 1000),
  enviado_en timestamptz not null default now(),
  revisado_por uuid references perfiles(id) on delete set null,
  revisado_por_nombre text,
  revisado_en timestamptz,
  unique (courier, dia)
);
create index if not exists despacho_cierres_dia on despacho_cierres (dia desc);
alter table despacho_cierres enable row level security;

notify pgrst, 'reload schema';

-- Revisión: las tres filas deben decir «sí».
select 'cuentas de repartidores' as que, case when to_regclass('public.despacho_repartidores') is not null then 'sí' else 'NO' end as quedo
union all
select 'cierres del día', case when to_regclass('public.despacho_cierres') is not null then 'sí' else 'NO' end
union all
select 'Despacho ciudad sabe lo marcado desde el panel', case when exists (
  select 1 from information_schema.columns where table_name = 'mon_despachos' and column_name = 'marcado_desde'
) then 'sí' else 'NO' end;
