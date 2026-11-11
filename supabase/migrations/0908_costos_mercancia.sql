-- Portal AF4 360°: costos de mercancía (reemplaza PRECIOS_DE_COSTE_MERCANCIA.xlsx, ver FINANZAS-360.md).
--
-- Un lote por llegada de mercancía con su costo real unitario (costo + comisiones + impuestos + envío + financiamiento).
-- El costo vigente de un producto es el de su lote más reciente (llegada más nueva; sin fecha, el último cargado), que es
-- lo que usa la hoja «MAESTRO ECOMFIVE». El mapeo une el nombre con que un producto aparece en Dropi con su producto de
-- costo, para darle costo a los pedidos de Dropi (Productos y márgenes / Estado de resultados de proveeduría).

create table if not exists fin_costos_lotes (
  id uuid primary key default gen_random_uuid(),
  hoja text not null,
  fila integer not null default 0,
  linea text not null,
  fecha_llegada date,
  mes_texto text,
  proveedor text,
  seguimiento text,
  producto text not null,
  producto_clave text not null,
  codigo text,
  sku_maestro_id uuid references skus_maestros(id) on delete set null,
  cantidad numeric(14, 2) check (cantidad is null or cantidad > 0),
  costo_unitario numeric(14, 6) not null default 0,
  comisiones numeric(14, 6) not null default 0,
  impuesto numeric(14, 6) not null default 0,
  envio numeric(14, 6) not null default 0,
  financiamiento numeric(14, 6) not null default 0,
  costo_total numeric(14, 6) not null check (costo_total > 0),
  estatus text,
  origen text not null default 'manual',
  origen_clave text unique,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists fin_costos_lotes_producto on fin_costos_lotes (producto_clave);

create table if not exists fin_costos_mapeo (
  id uuid primary key default gen_random_uuid(),
  producto_dropi text not null,
  producto_dropi_clave text not null unique,
  producto_clave text,
  estado text not null default 'pendiente' check (estado in ('mapeado', 'pendiente', 'sugerido')),
  notas text,
  actualizado_en timestamptz not null default now()
);

alter table fin_costos_lotes enable row level security;
alter table fin_costos_mapeo enable row level security;

-- Costo vigente por producto: el lote más reciente + el promedio ponderado por cantidad y cuántos lotes hay.
create or replace view fin_costo_vigente
with (security_invoker = true) as
with ordenados as (
  select l.*,
    row_number() over (
      partition by l.producto_clave
      order by l.fecha_llegada desc nulls last, l.fila desc, l.creado_en desc
    ) as n
  from fin_costos_lotes l
),
agregados as (
  select producto_clave,
    count(*) as lotes,
    sum(cantidad) as unidades,
    sum(cantidad * costo_total) / nullif(sum(cantidad), 0) as costo_promedio,
    min(costo_total) as costo_minimo,
    max(costo_total) as costo_maximo
  from fin_costos_lotes
  group by producto_clave
)
select o.producto_clave, o.producto, o.linea, o.codigo, o.sku_maestro_id, o.fecha_llegada, o.mes_texto, o.proveedor,
  o.costo_total as costo_vigente, o.estatus,
  a.lotes, a.unidades, round(a.costo_promedio, 6) as costo_promedio, a.costo_minimo, a.costo_maximo
from ordenados o
join agregados a on a.producto_clave = o.producto_clave
where o.n = 1;

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'costos-mercancia', solo_lectura
from permisos_rol
where modulo = 'gastos'
on conflict (rol_id, modulo) do nothing;
