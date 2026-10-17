-- Testing Lab: el recorrido completo de un producto queda enlazado de punta a punta (pedido de Alcides, 16 oct 2026), para
-- poder mostrarle a un cliente en qué etapa va lo que recomendó: Sugerencia → Selección → Creación de ofertas → Test →
-- Filtro → Compra. Faltaban dos eslabones: Selección → Test y Producto → Compra automática. Se puede repetir.

-- 1. Selección: estado «En test» (la oferta ya se armó y se envió a Test productos con «Enviar a Test»).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'wms_seleccion_productos'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%estado%'
  loop
    execute format('alter table wms_seleccion_productos drop constraint %I', r.conname);
  end loop;
end $$;
alter table wms_seleccion_productos
  add constraint wms_seleccion_productos_estado_check check (estado in ('seleccionado', 'crear_oferta', 'en_test', 'descartado'));

-- 2. Test productos sabe de qué fila de Selección viene (uno por fila).
alter table wms_productos_test add column if not exists seleccion_id uuid references wms_seleccion_productos(id) on delete set null;
create unique index if not exists wms_productos_test_seleccion_uidx on wms_productos_test (seleccion_id) where seleccion_id is not null;

-- 3. La compra que nace sola al pasar un producto a Activo guarda de qué producto viene.
alter table wms_compras add column if not exists sku_maestro_id uuid references skus_maestros(id) on delete set null;
create index if not exists wms_compras_sku_idx on wms_compras (sku_maestro_id) where sku_maestro_id is not null;
