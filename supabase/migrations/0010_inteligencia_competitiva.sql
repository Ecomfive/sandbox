-- Inteligencia competitiva: directorio de proveedores competidores visto
-- desde una cuenta dropshipper de Dropi, con una foto (snapshot) de su
-- cantidad de productos por fecha para poder ver crecimiento en el tiempo.

create table proveedores_competencia (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  dropi_id integer not null,
  nombre text not null,
  tienda text,
  ciudad text,
  categorias text[] not null default '{}',
  primera_vez_visto date not null default current_date,
  unique (pais_id, dropi_id)
);

create table snapshots_proveedor_competencia (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores_competencia(id) on delete cascade,
  fecha date not null,
  productos_count integer not null,
  unique (proveedor_id, fecha)
);

alter table proveedores_competencia enable row level security;
alter table snapshots_proveedor_competencia enable row level security;

create policy "authenticated read/write" on proveedores_competencia for all using (auth.role() = 'authenticated');
create policy "authenticated read/write" on snapshots_proveedor_competencia for all using (auth.role() = 'authenticated');

insert into permisos_rol (rol_id, modulo)
select id, 'inteligencia-competitiva' from roles where nombre = 'Admin';
