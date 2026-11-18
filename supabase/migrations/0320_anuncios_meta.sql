-- Anuncios Meta (18 nov 2026, pedido de Alcides): traer a Ecomfive lo que se hace en las cuentas publicitarias de Facebook/Instagram (solo lectura: no se crea, pausa ni cambia nada en Meta) para ver qué
-- campañas se montaron, quién, y qué video, ángulo, copy, landing y tipo de campaña (CBO/ABO, puja) funcionan. Lo lee el servidor con la Marketing API y lo guarda aquí.
--   * `meta_cuentas`: las cuentas publicitarias a leer (Oferfy tiene varias).
--   * `meta_campanas`, `meta_conjuntos`, `meta_anuncios`: la estructura, con el video, el texto y la landing de cada anuncio. Producto, ángulo y etapa salen del nombre de la campaña
--     (PAÍS | Producto | ÁNGULO | CBO | Puja | T) y se pueden corregir a mano (`manual` dice cuáles: la lectura no las pisa).
--   * `meta_resultados_dia`: un renglón por anuncio y día (gasto, impresiones, clics, video 3 s y 15 s, landing, carrito, pago, compras y valor).
--   * `meta_actividad`: el registro de actividad de la cuenta (quién creó o cambió qué).
--   * `meta_topes`: el CPA tope rentable por producto (lo que se puede pagar por compra sin perder).
--   * `meta_decisiones`: lo que el equipo decidió de cada sugerencia (aceptada, rechazada o pospuesta) y hasta cuándo.
--   * El módulo «anuncios-meta» para los roles que ya abren Rentabilidad o Test productos.
-- RLS activado y sin políticas: solo el servidor con la clave de servicio toca estas tablas. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0320_rollback.sql

create table if not exists meta_cuentas (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid references paises (id) on delete set null,
  nombre text not null check (char_length(nombre) between 2 and 80),
  act_id text not null unique check (act_id ~ '^act_[0-9]{5,20}$'),
  tienda text,
  moneda text not null default 'USD',
  zona_horaria text not null default 'America/Panama',
  activa boolean not null default true,
  ultima_lectura_en timestamptz,
  ultimo_error text,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);
alter table meta_cuentas enable row level security;

create table if not exists meta_campanas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references meta_cuentas (id) on delete cascade,
  meta_id text not null,
  nombre text not null,
  objetivo text,
  estado text not null default 'DESCONOCIDO',
  estructura text check (estructura in ('CBO', 'ABO')),
  puja text check (puja in ('sin_tope', 'bid_cap', 'cost_cap', 'roas_min')),
  presupuesto_diario numeric,
  creada_meta_en timestamptz,
  producto text,
  angulo text,
  etapa text check (etapa in ('testing', 'escala', 'retargeting')),
  manual text[] not null default '{}',
  creada_por text,
  actualizado_en timestamptz not null default now(),
  unique (cuenta_id, meta_id)
);
alter table meta_campanas enable row level security;

create table if not exists meta_conjuntos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references meta_cuentas (id) on delete cascade,
  campana_id uuid not null references meta_campanas (id) on delete cascade,
  meta_id text not null,
  nombre text not null,
  estado text not null default 'DESCONOCIDO',
  presupuesto_diario numeric,
  puja text,
  unique (cuenta_id, meta_id)
);
alter table meta_conjuntos enable row level security;

create table if not exists meta_anuncios (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references meta_cuentas (id) on delete cascade,
  campana_id uuid not null references meta_campanas (id) on delete cascade,
  conjunto_id uuid references meta_conjuntos (id) on delete set null,
  meta_id text not null,
  nombre text not null,
  estado text not null default 'DESCONOCIDO',
  video_id text,
  miniatura text,
  copy text,
  titulo text,
  landing text,
  unique (cuenta_id, meta_id)
);
alter table meta_anuncios enable row level security;
create index if not exists meta_anuncios_campana_idx on meta_anuncios (campana_id);

create table if not exists meta_resultados_dia (
  anuncio_id uuid not null references meta_anuncios (id) on delete cascade,
  cuenta_id uuid not null references meta_cuentas (id) on delete cascade,
  campana_id uuid not null references meta_campanas (id) on delete cascade,
  fecha date not null,
  gasto numeric not null default 0,
  impresiones integer not null default 0,
  clics integer not null default 0,
  video_3s integer not null default 0,
  video_15s integer not null default 0,
  vio_landing integer not null default 0,
  carrito integer not null default 0,
  pago integer not null default 0,
  compras integer not null default 0,
  valor numeric not null default 0,
  primary key (anuncio_id, fecha)
);
alter table meta_resultados_dia enable row level security;
create index if not exists meta_resultados_dia_cuenta_fecha_idx on meta_resultados_dia (cuenta_id, fecha);
create index if not exists meta_resultados_dia_campana_fecha_idx on meta_resultados_dia (campana_id, fecha);

create table if not exists meta_actividad (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references meta_cuentas (id) on delete cascade,
  clave text not null,
  fecha timestamptz not null,
  actor_id text,
  actor_nombre text,
  tipo text not null,
  objeto_tipo text,
  objeto_meta_id text,
  objeto_nombre text,
  detalle text,
  unique (cuenta_id, clave)
);
alter table meta_actividad enable row level security;
create index if not exists meta_actividad_cuenta_fecha_idx on meta_actividad (cuenta_id, fecha desc);

create table if not exists meta_topes (
  producto_clave text primary key,
  producto text not null,
  cpa_tope numeric not null check (cpa_tope > 0 and cpa_tope < 1000),
  actualizado_por uuid,
  actualizado_por_nombre text,
  actualizado_en timestamptz not null default now()
);
alter table meta_topes enable row level security;

create table if not exists meta_decisiones (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  estado text not null check (estado in ('aceptada', 'rechazada', 'pospuesta')),
  nota text,
  vigente_hasta date not null,
  decidido_por uuid,
  decidido_por_nombre text,
  decidido_en timestamptz not null default now()
);
alter table meta_decisiones enable row level security;

-- El módulo para quien ya abre Rentabilidad o Test productos; solo lectura si en todos los que tiene es de solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, 'anuncios-meta', bool_and(pr.solo_lectura)
from permisos_rol pr
where pr.modulo in ('rentabilidad', 'productos-test')
group by pr.rol_id
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';
