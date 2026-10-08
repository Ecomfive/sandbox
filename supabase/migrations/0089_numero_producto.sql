-- Producto: un número correlativo visible (N.º 1, 2, 3…) para ordenar los productos, aparte del SKU (pedido de Hernán, 8 oct
-- 2026). Tres identificadores, cada uno con su función:
--   * id (uuid, no se ve): une el producto con compras, inventario, fotos y fichas. Nunca cambia.
--   * numero (este): el correlativo que pone el sistema al crear; ordena la lista. Nunca cambia ni se repite.
--   * codigo (SKU): el que identifica el producto en el WMS, Shopify, las tiendas y Dropi. Único y, una vez creado, fijo
--     (si cambiara, las ventas que traen el código anterior ya no encontrarían el producto).
-- Los productos que ya existen se numeran por fecha de creación (y por SKU entre los creados a la vez). Se puede correr más de
-- una vez.

create sequence if not exists skus_maestros_numero_seq;
alter table skus_maestros add column if not exists numero bigint;

with orden as (
  select id, row_number() over (order by creado_en, codigo) + coalesce((select max(numero) from skus_maestros), 0) as n
  from skus_maestros
  where numero is null
)
update skus_maestros s set numero = orden.n from orden where s.id = orden.id;

select setval('skus_maestros_numero_seq', greatest(coalesce((select max(numero) from skus_maestros), 0), 1));
alter table skus_maestros alter column numero set default nextval('skus_maestros_numero_seq');
alter table skus_maestros alter column numero set not null;
create unique index if not exists skus_maestros_numero_unico on skus_maestros (numero);

-- El SKU no se cambia después de crear el producto.
create or replace function skus_maestros_sku_fijo() returns trigger
language plpgsql as $$
begin
  if new.codigo is distinct from old.codigo then
    raise exception 'El SKU de un producto no se cambia (lo usan las ventas de todas las plataformas).';
  end if;
  return new;
end;
$$;
drop trigger if exists skus_maestros_sku_fijo on skus_maestros;
create trigger skus_maestros_sku_fijo before update of codigo on skus_maestros for each row execute function skus_maestros_sku_fijo();
