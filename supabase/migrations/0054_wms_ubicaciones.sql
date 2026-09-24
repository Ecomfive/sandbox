-- Sistema WMS: «Ubicaciones» (bins) dentro de cada bodega — fase 2 del plan de WMS-REFERENCIA.md (calcado de `binset`,
-- `binsize` y `binproperty` de GreaterWMS). Toda bodega, también las externas, tiene sus ubicaciones. La **propiedad** de la
-- ubicación decidirá a qué cubeta de stock suma lo que se guarda ahí: normal → disponible, dañado, en inspección o retenido.

create table if not exists wms_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  bodega_id uuid not null references wms_bodegas(id),
  codigo text not null,
  propiedad text not null default 'normal' check (propiedad in ('normal', 'danado', 'inspeccion', 'retenido')),
  tamano text check (tamano in ('pequena', 'mediana', 'grande')),
  codigo_barras text,
  notas text,
  activa boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (bodega_id, codigo)
);

create index if not exists wms_ubicaciones_bodega_idx on wms_ubicaciones (bodega_id, codigo);

alter table wms_ubicaciones enable row level security;

drop policy if exists "authenticated read/write" on wms_ubicaciones;
create policy "authenticated read/write" on wms_ubicaciones for all using (auth.role() = 'authenticated');

insert into permisos_rol (rol_id, modulo)
select id, 'wms-ubicaciones' from roles where nombre = 'Admin'
on conflict do nothing;
