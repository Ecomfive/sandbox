-- Gestión de IDs Dropi › cada variación de Dropi vinculada a su variante en Producto (9 nov 2026, pedido de Hernán: «necesito que las variantes estén vinculadas
-- con sus variantes»). Una publicación de un producto con variaciones (colores, tallas, graduaciones) se vincula al producto principal; aquí cada variación de
-- Dropi (`firma`, la de `dropi_productos_proveedor.variaciones`) dice a qué variante nuestra corresponde (`skus_maestros.padre_id` = el principal).
-- * como = 'auto': la puso el sistema (mismo SKU, mismos valores o el mismo número); 'manual': la eligió una persona en la ficha, y el sistema no la cambia.
-- Inventario usa el vínculo para poner el stock de Dropi de cada variación en su variante, no en el principal.
-- Código: src/lib/publicaciones/vincular-variaciones.ts. RLS sin políticas. Se puede repetir.
-- Reversa: supabase/rollbacks/0261_rollback.sql

create table if not exists dropi_variaciones_vinculo (
  id uuid primary key default uuid_v7(),
  pais_id uuid not null references paises(id),
  dropi_producto_id bigint not null,
  firma text not null,
  sku_maestro_id uuid not null references skus_maestros(id) on delete cascade,
  como text not null default 'auto' check (como in ('auto', 'manual')),
  creado_por uuid,
  actualizado_en timestamptz not null default now(),
  unique (pais_id, dropi_producto_id, firma)
);
create index if not exists dropi_variaciones_vinculo_sku_idx on dropi_variaciones_vinculo (sku_maestro_id);

alter table dropi_variaciones_vinculo enable row level security;
