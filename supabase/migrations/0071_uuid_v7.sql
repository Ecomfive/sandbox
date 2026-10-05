-- UUID v7 para las llaves de los productos y del WMS (decisión del 5 oct 2026, ver WMS-REFERENCIA.md).
--
-- Un UUID v7 empieza con la marca de tiempo en milisegundos, así que se ordena solo por fecha de creación y se indexa mejor
-- en tablas grandes que uno v4 (aleatorio). Se genera en la base, sin coordinar y sin riesgo de duplicados.
-- OJO: no tiene nada que ver con el vencimiento de un producto. El vencimiento se controla con lotes (otra etapa).
--
-- `uuid_v7()` se implementa en SQL puro, así que no depende de la versión de Postgres (PostgreSQL 18 trae `uuidv7()`). Solo
-- cambia el valor por defecto de las llaves NUEVAS: los UUID que ya existen no se tocan y siguen siendo válidos.

create or replace function uuid_v7() returns uuid
language sql volatile as $$
  select encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid()) placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid
$$;

-- Los productos y todas las tablas del WMS (`wms_*`) estrenan UUID v7 en su columna `id`.
do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'id'
      and c.data_type = 'uuid'
      and c.column_default like 'gen_random_uuid()%'
      and (c.table_name like 'wms\_%' or c.table_name in ('skus_maestros', 'sku_maestro_componentes'))
  loop
    execute format('alter table public.%I alter column id set default uuid_v7()', t.table_name);
    raise notice 'UUID v7 en %', t.table_name;
  end loop;
end $$;
