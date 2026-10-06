-- Compras: número de orden de compra (OC), un correlativo único de todas las compras —de todos los países e Importadora—,
-- aparte del código por país (ECOM01-0450…). Pedido de Hernán (8 oct 2026): «para saber qué orden de compra es»; cuando una
-- compra tiene sus productos vinculados, su título pasa a ser su número (OC-0123) en vez del nombre que traía de ClickUp.
--
-- Las compras que ya existen se numeran desde 1 en el orden en que se crearon (no se cambia nada más de ellas). Las nuevas
-- toman el siguiente número de la secuencia, también las que traiga una nueva importación de ClickUp.

alter table wms_compras add column if not exists numero integer;

with orden as (
  select id, row_number() over (order by creado_en, id) as n
  from wms_compras
)
update wms_compras c set numero = orden.n from orden where c.id = orden.id and c.numero is null;

create sequence if not exists wms_compras_numero_seq owned by wms_compras.numero;
select setval('wms_compras_numero_seq', greatest((select coalesce(max(numero), 0) from wms_compras), 1), (select count(*) > 0 from wms_compras));
alter table wms_compras alter column numero set default nextval('wms_compras_numero_seq');
alter table wms_compras alter column numero set not null;
create unique index if not exists wms_compras_numero_unico on wms_compras (numero);
