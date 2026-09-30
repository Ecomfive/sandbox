-- El "Estado" real de la hoja de cálculo tiene más valores de los que se supuso en 0059 (se descubrió al
-- extraer los datos de septiembre para importar): además de enviado_a_compras/fallido/descartado, se usan
-- pendiente, backlog, testeando, reserva, consulta y winner. Se amplía el check y el valor por defecto pasa
-- de 'sin_definir' a 'pendiente' (el que de verdad usa la hoja); la tabla está vacía, así que no hay datos
-- que migrar.

alter table wms_productos_test alter column estado set default 'pendiente';
alter table wms_productos_test drop constraint if exists wms_productos_test_estado_check;
alter table wms_productos_test add constraint wms_productos_test_estado_check
  check (estado in ('pendiente', 'backlog', 'testeando', 'reserva', 'consulta', 'winner', 'enviado_a_compras', 'fallido', 'descartado'));
