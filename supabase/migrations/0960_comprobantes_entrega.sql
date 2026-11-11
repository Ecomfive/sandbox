-- Portal AF4 360°: comprobantes de entrega y de cobro de las órdenes de Shopify (foto en bucket privado `ven-comprobantes`).
create table if not exists ven_orden_comprobantes (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ven_ordenes(id) on delete cascade,
  tipo text not null default 'entrega' check (tipo in ('entrega', 'cobro', 'otro')),
  ruta text not null unique,
  nota text,
  subido_por text,
  creado_en timestamptz not null default now()
);
create index if not exists ven_orden_comprobantes_orden_idx on ven_orden_comprobantes (orden_id, creado_en desc);
alter table ven_orden_comprobantes enable row level security;
comment on table ven_orden_comprobantes is 'Portal AF4 360°: fotos de comprobante de entrega o cobro de una orden; la ruta es del bucket privado ven-comprobantes.';
