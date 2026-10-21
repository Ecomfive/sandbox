-- Deshace 0119_sku_con_variante.sql: vuelve a poner a esos productos el SKU con /2, /3 de antes.
-- Solo toca un producto si su SKU sigue siendo el que puso la migración (si alguien lo corrigió a mano después, se respeta).

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
select s.id, c.viejo as nuevo, c.nuevo as actual
from _cambio_sku c
join skus_maestros s on s.numero = c.numero
where btrim(s.codigo) = c.nuevo;

do $$
begin
  if exists (
    select 1 from _aplicar a join skus_maestros s on s.id <> a.id and lower(btrim(s.codigo)) = lower(btrim(a.nuevo))
  ) then
    raise exception 'Un SKU de antes ya lo usa otro producto: no se deshizo nada';
  end if;
end $$;

update skus_maestros s set codigo = a.nuevo from _aplicar a where s.id = a.id;
update wms_producto_variantes v set sku = a.nuevo from _aplicar a where v.sku_maestro_id = a.id;
update wms_dropi_productos d set sku = a.nuevo from _aplicar a where d.sku_maestro_id = a.id;

insert into historial_auditoria (usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues)
select 'Reversa 0119', 'cambiar_sku_producto', 'skus_maestros', a.id::text, null, jsonb_build_object('SKU', a.actual), jsonb_build_object('SKU', a.nuevo)
from _aplicar a;

commit;
