-- Sistema WMS: «Filtros» dentro de Compras — el embudo de cotización de productos candidatos, calcado de la
-- lista de ClickUp «Productos y Filtro PA» (Oceans Ecommerce). Va antes de convertirse en una Compra
-- confirmada (`wms_compras`): aquí se cotiza y se aprueba o se descarta un producto candidato.

create table if not exists wms_filtro_productos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  nombre text not null,
  foto_url text,
  -- El embudo de cotización (columna «Estado del Registro» en ClickUp).
  estado_registro text not null default 'en_cola'
    check (estado_registro in ('en_cola', 'enviado_a_test', 'cotizar', 'cotizado', 'aprobado', 'descartado')),
  -- El semáforo de ClickUp aparte del embudo (columna «Estado»).
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_progreso', 'completado', 'archivado')),
  tipo_envio text check (tipo_envio in ('aereo', 'maritimo')),
  qty_producto integer,
  precio_total numeric(12, 2),
  precio_unitario numeric(12, 2),
  prioridad text not null default 'normal' check (prioridad in ('urgente', 'alta', 'normal', 'baja')),
  asignado_a uuid references perfiles(id),
  aprobacion_gestionada boolean not null default false,
  comentarios text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists wms_filtro_productos_pais_idx on wms_filtro_productos (pais_id, creado_en desc);

alter table wms_filtro_productos enable row level security;
create policy "authenticated read/write" on wms_filtro_productos for all using (auth.role() = 'authenticated');
