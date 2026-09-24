-- Sistema WMS: «Bodegas». Las 6 fuentes físicas de la arquitectura V2 (Despacho, Fulfillment, Dropi, Effi, Boxfull y Dunamixfy),
-- por país. `tipo` dice quién manda el stock: una bodega **propia** la mueve el WMS; en una **externa** el stock lo tiene
-- el tercero y llega por sincronización (solo lectura aquí). Amplía la tabla `wms_bodegas` creada en 0051.

alter table wms_bodegas add column if not exists codigo text;
alter table wms_bodegas add column if not exists tipo text not null default 'propia';
alter table wms_bodegas add column if not exists direccion text;
alter table wms_bodegas add column if not exists contacto text;
alter table wms_bodegas add column if not exists notas text;
alter table wms_bodegas add column if not exists orden integer not null default 0;
alter table wms_bodegas add column if not exists actualizado_en timestamptz not null default now();

alter table wms_bodegas drop constraint if exists wms_bodegas_tipo_check;
alter table wms_bodegas add constraint wms_bodegas_tipo_check check (tipo in ('propia', 'externa'));

-- Un código de las 6 fuentes solo puede repetirse en otro país, nunca dentro del mismo.
create unique index if not exists wms_bodegas_codigo_idx on wms_bodegas (pais_id, codigo) where codigo is not null;

-- La bodega que Dropi muestra para Ecomfive en Panamá (creada en 0051) es la bodega «Dropi».
update wms_bodegas
   set nombre = 'Dropi', codigo = 'dropi', tipo = 'externa', direccion = 'Ave Centenario, Costa del Este', orden = 3
 where nombre = 'Proveedor Ecomfive (Ave Centenario, Costa del Este)'
   and not exists (select 1 from wms_bodegas b where b.pais_id = wms_bodegas.pais_id and b.codigo = 'dropi');

insert into wms_bodegas (pais_id, nombre, codigo, tipo, orden)
select p.id, b.nombre, b.codigo, b.tipo, b.orden
  from paises p
 cross join (values
   ('Despacho', 'despacho', 'propia', 1),
   ('Fulfillment', 'fulfillment', 'propia', 2),
   ('Dropi', 'dropi', 'externa', 3),
   ('Effi', 'effi', 'externa', 4),
   ('Boxfull', 'boxfull', 'externa', 5),
   ('Dunamixfy', 'dunamixfy', 'externa', 6)
 ) as b(nombre, codigo, tipo, orden)
 where p.codigo in ('CR', 'PA')
on conflict do nothing;

insert into permisos_rol (rol_id, modulo)
select id, 'wms-bodegas' from roles where nombre = 'Admin'
on conflict do nothing;
