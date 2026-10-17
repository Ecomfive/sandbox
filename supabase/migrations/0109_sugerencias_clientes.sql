-- Testing Lab › Fuentes › «Sugerencias de clientes» (pedido de Alcides, 15 oct 2026): los productos que un dropshipper nos
-- recomienda. Atención los carga desde la ficha del dropshipper en el CRM («Recomendar producto») sin necesitar acceso a este
-- módulo; aquí se revisan y, al marcarlos Seleccionado, pasan solos a Selección de productos con su código SUG-. Cada
-- sugerencia guarda quién la recomendó: de ahí sale su % de acierto y el seguimiento que se le cuenta (sin cantidades ni
-- costos). Se puede repetir.

-- 1. La fuente nueva en los correlativos y en Selección (SUG-0001).
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tabla
    from pg_constraint c
    where c.conrelid in ('wms_fuente_correlativos'::regclass, 'wms_seleccion_productos'::regclass)
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%fuente%'
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
  end loop;
end $$;

alter table wms_fuente_correlativos
  add constraint wms_fuente_correlativos_fuente_check
  check (fuente in ('drop_killer', 'tu_winner', 'scraping_proveedores', 'manual', 'sugerencia_cliente'));
alter table wms_seleccion_productos
  add constraint wms_seleccion_productos_fuente_check
  check (fuente in ('drop_killer', 'tu_winner', 'scraping_proveedores', 'manual', 'sugerencia_cliente'));

insert into wms_fuente_correlativos (fuente, prefijo) values ('sugerencia_cliente', 'SUG') on conflict (fuente) do nothing;

-- 2. Las sugerencias.
create table if not exists sugerencias_clientes (
  id uuid primary key default uuid_v7(),
  -- SUG-0001: el mismo código que lleva en Selección.
  codigo text not null unique,
  -- Quién lo recomendó y el país de operación donde se trabaja (el de la barra de arriba al registrarla).
  dropshipper_id uuid not null references dropshippers(id) on delete restrict,
  pais_id uuid not null references paises(id),
  nombre text not null,
  foto_url text,
  notas text,
  categoria text,
  -- El país donde el cliente vio el producto (código ISO de dos letras; cualquiera del mundo).
  pais_detectado text check (pais_detectado is null or pais_detectado ~ '^[A-Z]{2}$'),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'seleccionado', 'descartado')),
  motivo_descarte text,
  -- La fila de Selección que nació al marcarla Seleccionado.
  seleccion_id uuid unique references wms_seleccion_productos(id) on delete set null,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists sugerencias_clientes_dropshipper_idx on sugerencias_clientes (dropshipper_id, creado_en desc);
create index if not exists sugerencias_clientes_pais_idx on sugerencias_clientes (pais_id, estado);
alter table sugerencias_clientes enable row level security;

-- 3. Selección sabe de qué sugerencia viene (para el seguimiento del cliente).
alter table wms_seleccion_productos add column if not exists sugerencia_id uuid references sugerencias_clientes(id) on delete set null;
create unique index if not exists wms_seleccion_productos_sugerencia_uidx on wms_seleccion_productos (sugerencia_id) where sugerencia_id is not null;

-- 4. El permiso del módulo: quien ya puede trabajar en Selección de productos, con su mismo solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'sugerencias-clientes', solo_lectura
from permisos_rol
where modulo = 'seleccion-productos'
on conflict (rol_id, modulo) do nothing;
