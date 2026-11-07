-- Las ventas de Effi por artículo y día (7 nov 2026, pedido de Hernán: que el cuadro de Effi quede completo como el de Dropi). Effi las registra como remisiones de venta y las
-- devoluciones aparte; la lectura diaria las pide por su API (`detalle_remision_v`, `detalle_devolucion_v`) y aquí guarda solo las de la bodega Principal, que es la nuestra. Lleva la
-- plataforma para que Drop use la misma tabla cuando se lean sus pedidos.

create table if not exists plataforma_ventas_diarias (
  pais_id uuid not null references paises(id),
  plataforma text not null check (plataforma in ('effi', 'drop')),
  -- El id del artículo en la plataforma (`effi_publicaciones.effi_id`).
  producto_id text not null,
  dia date not null,
  salidas integer not null default 0 check (salidas >= 0),
  devueltas integer not null default 0 check (devueltas >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (pais_id, plataforma, producto_id, dia)
);
create index if not exists plataforma_ventas_diarias_dia on plataforma_ventas_diarias (pais_id, plataforma, dia);
alter table plataforma_ventas_diarias enable row level security;

notify pgrst, 'reload schema';
