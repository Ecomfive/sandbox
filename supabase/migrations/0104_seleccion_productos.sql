-- Testing Lab › Selección › «Selección de productos» (pedido de Alcides, 13 oct 2026): el tablero donde caen los productos
-- candidatos que salen de las fuentes (Drop Killer, Tu Winner, Scraping de proveedores) o que se crean a mano, y donde se
-- decide cuáles se testean. Una fila NO es un producto de Producto (no lleva SKU): es un candidato. Estados: Por evaluar,
-- Seleccionado y Descartado. Va por país, como Test productos y Filtro de productos. Se puede repetir.

-- Cada fuente numera lo suyo (DK-0001, TW-0001, SP-0001, MAN-0001): `wms_siguiente_codigo_fuente` lo reparte sin huecos
-- dobles aunque dos personas creen a la vez (un UPDATE … RETURNING sobre la fila de la fuente).
create table if not exists wms_fuente_correlativos (
  fuente text primary key check (fuente in ('drop_killer', 'tu_winner', 'scraping_proveedores', 'manual')),
  prefijo text not null,
  ultimo integer not null default 0
);
alter table wms_fuente_correlativos enable row level security;

insert into wms_fuente_correlativos (fuente, prefijo) values
  ('drop_killer', 'DK'),
  ('tu_winner', 'TW'),
  ('scraping_proveedores', 'SP'),
  ('manual', 'MAN')
on conflict (fuente) do nothing;

create or replace function wms_siguiente_codigo_fuente(p_fuente text) returns text
language plpgsql as $$
declare
  v_prefijo text;
  v_numero integer;
begin
  update wms_fuente_correlativos set ultimo = ultimo + 1 where fuente = p_fuente returning prefijo, ultimo into v_prefijo, v_numero;
  if not found then
    raise exception 'Fuente no válida: %.', p_fuente;
  end if;
  return v_prefijo || '-' || lpad(v_numero::text, 4, '0');
end $$;

create table if not exists wms_seleccion_productos (
  id uuid primary key default uuid_v7(),
  -- El N.º de la fila en Selección (SEL-0001), como el N.º OC de Compras.
  numero integer not null,
  pais_id uuid not null references paises(id),
  nombre text not null,
  estado text not null default 'por_evaluar' check (estado in ('por_evaluar', 'seleccionado', 'descartado')),
  fuente text not null check (fuente in ('drop_killer', 'tu_winner', 'scraping_proveedores', 'manual')),
  -- El correlativo que trae de su fuente (DK-0012); el de una fila creada a mano es MAN-0001.
  codigo_fuente text not null,
  fecha_captacion date not null default current_date,
  foto_url text,
  url_pagina text,
  url_ad_library text,
  costo_proveedor numeric(12, 2) check (costo_proveedor is null or costo_proveedor >= 0),
  precio_venta numeric(12, 2) check (precio_venta is null or precio_venta >= 0),
  categoria text,
  responsable_id uuid references perfiles(id) on delete set null,
  notas text,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create sequence if not exists wms_seleccion_productos_numero_seq owned by wms_seleccion_productos.numero;
alter table wms_seleccion_productos alter column numero set default nextval('wms_seleccion_productos_numero_seq');
create unique index if not exists wms_seleccion_productos_numero_uidx on wms_seleccion_productos (numero);
create unique index if not exists wms_seleccion_productos_codigo_uidx on wms_seleccion_productos (codigo_fuente);
create index if not exists wms_seleccion_productos_pais_idx on wms_seleccion_productos (pais_id, estado);

-- Solo el servidor (con la clave de servicio) toca los datos: RLS activo y sin políticas (ver SEGURIDAD.md).
alter table wms_seleccion_productos enable row level security;
