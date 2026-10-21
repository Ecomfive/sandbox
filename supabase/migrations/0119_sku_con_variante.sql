-- SKU de los productos que se distinguían por un número: ahora con su característica (21 oct 2026).
--
-- Varios productos eran el mismo con distinto color o sabor y llevaban /2, /3 para no repetir el SKU («BANDA/EJERCICIO/PEDALES/2»). Ahora el
-- SKU dice qué los distingue («BANDA/EJERCICIO/PEDALES/MORADO»), como el producto con su cantidad de cápsulas («MAGNESIUM/COMPLEX/60»). El
-- primero del grupo también lleva la suya. La regla para los productos nuevos está en src/lib/wms/sugerir-sku.ts.
--
--   * Solo se cambia un producto si todavía tiene el SKU de antes (si alguien lo corrigió a mano, se respeta).
--   * Si algún SKU nuevo ya lo usa otro producto, o se repite en la lista, no cambia nada (la migración falla entera).
--   * Las fichas de Shopify y de Dropi enlazadas toman el SKU nuevo; en las plataformas (Dropi, tiendas) el SKU hay que cambiarlo a mano
--     si alguno estaba puesto allí.
--   * Cada cambio queda en la actividad del producto (cambiar_sku_producto).
--   * Para deshacerlo: supabase/rollbacks/0119_rollback.sql.

begin;

create temporary table _cambio_sku (numero bigint primary key, viejo text not null, nuevo text not null) on commit drop;
insert into _cambio_sku (numero, viejo, nuevo) values
  (176, 'TONICO/DEPILACION/TRULY', 'TONICO/DEPILACION/TRULY/GLAZED/DONUT'),
  (185, 'TONICO/DEPILACION/TRULY/2', 'TONICO/DEPILACION/TRULY/SOFT/SERVE'),
  (186, 'TONICO/DEPILACION/TRULY/3', 'TONICO/DEPILACION/TRULY/UNICORN/FRUIT'),
  (38, 'BOLSO/NAYLA/GRAN', 'BOLSO/NAYLA/GRAN/PURPURA'),
  (39, 'BOLSO/NAYLA/GRAN/2', 'BOLSO/NAYLA/GRAN/VERDE'),
  (289, 'BOLSO/BANDOLERO/MULTICHIC', 'BOLSO/BANDOLERO/MULTICHIC/BEIGE'),
  (36, 'BOLSO/BANDOLERO/MULTICHIC/2', 'BOLSO/BANDOLERO/MULTICHIC/MARRON'),
  (37, 'BOLSO/BANDOLERO/MULTICHIC/3', 'BOLSO/BANDOLERO/MULTICHIC/NEGRO'),
  (275, 'BASE/MAQUILLAJE/ZEPHOCO', 'BASE/MAQUILLAJE/ZEPHOCO/IVORY/WHITE'),
  (29, 'BASE/MAQUILLAJE/ZEPHOCO/2', 'BASE/MAQUILLAJE/ZEPHOCO/DARK'),
  (30, 'BASE/MAQUILLAJE/ZEPHOCO/3', 'BASE/MAQUILLAJE/ZEPHOCO/NATURAL'),
  (26, 'BANDA/EJERCICIO/PEDALES', 'BANDA/EJERCICIO/PEDALES/AZUL'),
  (27, 'BANDA/EJERCICIO/PEDALES/2', 'BANDA/EJERCICIO/PEDALES/MORADO'),
  (28, 'BANDA/EJERCICIO/PEDALES/3', 'BANDA/EJERCICIO/PEDALES/ROSA');

create temporary table _aplicar on commit drop as
select s.id, s.numero, s.codigo as viejo, c.nuevo
from _cambio_sku c
join skus_maestros s on s.numero = c.numero
where btrim(s.codigo) = c.viejo;

do $$
begin
  if exists (
    select 1 from _aplicar a join skus_maestros s on s.id <> a.id and lower(btrim(s.codigo)) = lower(btrim(a.nuevo))
  ) then
    raise exception 'Un SKU nuevo ya lo usa otro producto: no se cambió nada';
  end if;
  if (select count(*) from _aplicar) <> (select count(distinct lower(a.nuevo)) from _aplicar a) then
    raise exception 'Hay SKU nuevos repetidos dentro de la lista: no se cambió nada';
  end if;
  raise notice 'Se cambian % de % productos de la lista', (select count(*) from _aplicar), (select count(*) from _cambio_sku);
end $$;

update skus_maestros s set codigo = a.nuevo from _aplicar a where s.id = a.id;

-- Las fichas de canal enlazadas guardan una copia del SKU.
update wms_producto_variantes v set sku = a.nuevo from _aplicar a where v.sku_maestro_id = a.id;
update wms_dropi_productos d set sku = a.nuevo from _aplicar a where d.sku_maestro_id = a.id;

insert into historial_auditoria (usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues)
select 'Migración 0119', 'cambiar_sku_producto', 'skus_maestros', a.id::text, null, jsonb_build_object('SKU', a.viejo), jsonb_build_object('SKU', a.nuevo)
from _aplicar a;

commit;
