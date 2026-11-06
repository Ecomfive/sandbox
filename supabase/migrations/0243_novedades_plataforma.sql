-- Dañados y devoluciones en las plataformas (6 nov 2026, pedido de Hernán, flujograma de Proveeduría Costa Rica). Ninguna lectura de plataforma trae este detalle por unidad, así que se
-- registra a mano. Un dañado se confirma (baja) o no (reclamo por posible robo) y una devolución vuelve al inventario o no. No toca `wms_stock`: el cuadro de la plataforma lo tiene en cuenta.

create sequence if not exists wms_novedades_numero_seq;

create table if not exists wms_novedades_plataforma (
  id uuid primary key default uuid_v7(),
  numero integer not null unique default nextval('wms_novedades_numero_seq'),
  pais_id uuid not null references paises(id),
  bodega_id uuid not null references wms_bodegas(id),
  sku_maestro_id uuid not null references skus_maestros(id),
  tipo text not null check (tipo in ('danado', 'devolucion')),
  cantidad integer not null check (cantidad > 0),
  -- El pedido o la guía, si se sabe.
  referencia text,
  nota text,
  -- La prueba de un dañado: la foto, o que el producto volvió a la oficina.
  foto_url text,
  retorno_oficina boolean not null default false,
  estado text not null default 'por_revisar' check (estado in ('por_revisar', 'baja', 'reclamo', 'vuelve', 'no_vuelve')),
  check (estado = 'por_revisar' or (tipo = 'danado' and estado in ('baja', 'reclamo')) or (tipo = 'devolucion' and estado in ('vuelve', 'no_vuelve'))),
  -- Quiénes pueden resolver un dañado: los autorizadores del país, menos quien lo reportó. Una devolución la resuelve cualquiera con edición.
  autoriza_a uuid[] not null default '{}',
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_nombre text not null,
  creado_en timestamptz not null default now(),
  resuelto_por uuid references perfiles(id) on delete set null,
  resuelto_por_nombre text,
  resuelto_en timestamptz,
  nota_resolucion text
);
alter sequence wms_novedades_numero_seq owned by wms_novedades_plataforma.numero;
create index if not exists wms_novedades_pais on wms_novedades_plataforma (pais_id, estado, creado_en desc);
create index if not exists wms_novedades_bodega on wms_novedades_plataforma (bodega_id, estado);
alter table wms_novedades_plataforma enable row level security;

notify pgrst, 'reload schema';
