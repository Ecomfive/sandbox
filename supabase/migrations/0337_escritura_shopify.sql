-- Escribir en Shopify desde el sistema, etapa 1: las etiquetas del pedido (19 nov 2026, pedido de Hernán: «literal lo que ya hacemos con Dropi: al
-- cambiar una etiqueta aquí en el sistema se debe cambiar en Shopify»). Atención al cliente valida pedidos («Confirmada») y cambia etiquetas desde la
-- ficha del pedido; cada persona solo en sus tiendas.
--   * `tiendas.escribe_shopify`: el interruptor por tienda (apagado de entrada). Lo enciende un administrador en Tiendas Shopify, después de aprobar
--     el permiso write_orders de la app en la tienda. Con quién y cuándo.
--   * `ven_orden_eventos.tipo` acepta 'etiqueta': cada cambio queda en el historial del pedido.
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0337_rollback.sql
alter table tiendas add column if not exists escribe_shopify boolean not null default false;
alter table tiendas add column if not exists escribe_shopify_por uuid references perfiles(id) on delete set null;
alter table tiendas add column if not exists escribe_shopify_en timestamptz;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'ven_orden_eventos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table ven_orden_eventos drop constraint %I', c.conname);
  end loop;
end $$;
alter table ven_orden_eventos add constraint ven_orden_eventos_tipo_check check (tipo in ('fase', 'cobro', 'remesa', 'nota', 'etiqueta'));

notify pgrst, 'reload schema';

-- Revisión: las dos filas deben decir «sí».
select 'interruptor por tienda' as que,
  case when exists (select 1 from information_schema.columns where table_name = 'tiendas' and column_name = 'escribe_shopify') then 'sí' else 'NO' end as quedo
union all
select 'historial acepta etiqueta',
  case when exists (
    select 1 from pg_constraint where conrelid = 'ven_orden_eventos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%etiqueta%'
  ) then 'sí' else 'NO' end;
