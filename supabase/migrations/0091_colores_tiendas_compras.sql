-- Compras: el color de cada tienda, como el de las etiquetas (pedido de Hernán, 8 oct 2026). El color es de la tienda (por su
-- nombre), no de cada compra. Las tiendas que ya existen arrancan cada una con un color distinto de la paleta; una tienda nueva
-- toma uno automático hasta que se le elija. RLS sin políticas: solo el servidor la toca (migración 0063, SEGURIDAD.md).

create table if not exists wms_compras_tiendas (
  nombre text primary key check (btrim(nombre) <> ''),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  actualizado_en timestamptz not null default now()
);
alter table wms_compras_tiendas enable row level security;

insert into wms_compras_tiendas (nombre, color)
select nombre,
       (array['#7B68EE', '#0090FF', '#30A46C', '#F76B15', '#D6409F', '#12A594', '#E5484D', '#FFC53D', '#8E4EC6', '#3E63DD',
               '#00A2C7', '#A18072', '#5B4FD8', '#8D8D8D', '#202020'])
         [((row_number() over (order by nombre)) - 1) % 15 + 1]
from (select distinct btrim(unnest(tiendas)) as nombre from wms_compras) t
where nombre <> ''
on conflict (nombre) do nothing;
