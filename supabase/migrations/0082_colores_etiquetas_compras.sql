-- Compras: el color de cada etiqueta, elegido a mano como en ClickUp (pedido de Hernán, 8 oct 2026). El color es de la
-- etiqueta (por su nombre), no de cada compra: «avery» morada se ve morada en todas. Sin color elegido, la etiqueta usa uno
-- automático según su nombre. RLS sin políticas: solo el servidor la toca (ver migración 0063 y SEGURIDAD.md).

create table if not exists wms_compras_etiquetas (
  nombre text primary key check (btrim(nombre) <> ''),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  actualizado_en timestamptz not null default now()
);
alter table wms_compras_etiquetas enable row level security;
