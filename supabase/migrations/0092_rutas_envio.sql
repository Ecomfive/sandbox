-- Compras › Envíos (pedido de Hernán, 8 oct 2026; antes el tablero «Envíos desde China» de ClickUp).
--   · wms_compras.agente_envio: quién trae la mercancía (Chin, Avery…), aparte del proveedor que la vende. Las compras de
--     proveedor «Chin» quedan con agente «Chin».
--   · wms_rutas_envio: lo que ofrece cada agente para llevar a un país por una vía (DDP/DAP, courier), el tiempo que promete
--     (días mínimo y máximo) y si el canal está activo. El país es su código ISO: no hace falta que exista en `paises`.
--   · wms_rutas_envio_tarifas: el costo de cada ruta por tipo de producto (por CBM en marítimo, por kg en aéreo), con la fecha
--     desde la que rige; una tarifa nueva no borra la anterior (queda el historial).
-- RLS sin políticas: solo el servidor las toca (migración 0063, SEGURIDAD.md).

alter table wms_compras add column if not exists agente_envio text;
update wms_compras set agente_envio = 'Chin' where agente_envio is null and proveedor = 'Chin';

create table if not exists wms_rutas_envio (
  id uuid primary key default uuid_v7(),
  -- Sin agente: una ruta que se está evaluando y todavía no tiene quién la haga.
  agente text check (agente is null or btrim(agente) <> ''),
  pais_codigo text not null check (pais_codigo ~ '^[A-Z]{2}$'),
  pais_nombre text not null,
  via text not null check (via in ('mar', 'aire', 'tierra')),
  modalidad text check (modalidad in ('DDP', 'DAP')),
  courier text,
  dias_min integer check (dias_min is null or dias_min between 0 and 365),
  dias_max integer check (dias_max is null or dias_max between 0 and 365),
  activo boolean not null default true,
  nota text,
  url text,
  -- La tarea de ClickUp de donde vino (una tarea con dos agentes dio dos rutas).
  clickup_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (dias_min is null or dias_max is null or dias_min <= dias_max),
  unique (clickup_id, agente)
);
create index if not exists wms_rutas_envio_pais_idx on wms_rutas_envio (pais_codigo, via);
alter table wms_rutas_envio enable row level security;

create table if not exists wms_rutas_envio_tarifas (
  id uuid primary key default uuid_v7(),
  ruta_id uuid not null references wms_rutas_envio(id) on delete cascade,
  tipo_producto text not null default 'General' check (btrim(tipo_producto) <> ''),
  precio numeric(12, 2) not null check (precio >= 0),
  unidad text not null check (unidad in ('cbm', 'kg')),
  vigente_desde date not null default current_date,
  creado_por text,
  creado_en timestamptz not null default now()
);
create index if not exists wms_rutas_envio_tarifas_ruta_idx on wms_rutas_envio_tarifas (ruta_id, tipo_producto, vigente_desde desc);
alter table wms_rutas_envio_tarifas enable row level security;
