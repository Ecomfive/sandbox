-- Portal AF4 360°: enlace propio de cada mensajero para su web app (se guarda solo el hash del código; el código no se puede recuperar).
create table if not exists ven_mensajero_enlaces (
  repartidor_id uuid primary key references del_repartidores(id) on delete cascade,
  token_hash text not null unique,
  creado_por text,
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz
);
alter table ven_mensajero_enlaces enable row level security;
comment on table ven_mensajero_enlaces is 'Portal AF4 360°: acceso de un mensajero a su web app /mensajero/<código>; un enlace nuevo reemplaza al anterior.';
