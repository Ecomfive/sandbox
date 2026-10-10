-- Producto: un número correlativo visible (N.º 1, 2, 3…) para ordenar los productos, aparte del SKU (pedido de Hernán, 8 oct
-- 2026). Tres identificadores, cada uno con su función:
--   * id (uuid, no se ve): une el producto con compras, inventario, fotos y fichas. Nunca cambia.
--   * numero (este): el correlativo que pone el sistema al crear; ordena la lista. Nunca cambia ni se repite.
--   * codigo (SKU): el que identifica el producto en el WMS, Shopify, las tiendas y Dropi. Lo escribe la persona, es único y
--     se puede corregir después, siempre por uno que no exista (y cambiándolo también en las plataformas).
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

-- El SKU se puede corregir desde la ficha, siempre que no lo tenga otro producto (lo impide el índice único
-- skus_maestros_codigo_unico). Por si una versión anterior de esta migración lo había bloqueado:
drop trigger if exists skus_maestros_sku_fijo on skus_maestros;
drop function if exists skus_maestros_sku_fijo();
