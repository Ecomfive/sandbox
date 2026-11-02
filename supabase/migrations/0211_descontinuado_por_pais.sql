-- Descontinuado por país (pedido de Hernán, 31 oct 2026): un producto puede dejar de traerse a un país (por ejemplo, Costa Rica) y seguir
-- comprándose para los demás. «Descontinuado» en el estado del producto (migración 0103) sigue valiendo para todos los países; esta tabla
-- marca solo los países elegidos en la ficha del producto. En ese país no se puede crear ni agregar a una compra, y Gestión de IDs Dropi y
-- «Productos que pregunta» del chat lo muestran «Descontinuado en Costa Rica». Solo lo lee y escribe el servidor (sin políticas).
-- Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0211_rollback.sql

create table if not exists skus_descontinuado_pais (
  sku_id uuid not null references skus_maestros(id) on delete cascade,
  pais_id uuid not null references paises(id) on delete cascade,
  creado_por text,
  creado_en timestamptz not null default now(),
  primary key (sku_id, pais_id)
);
create index if not exists skus_descontinuado_pais_pais_idx on skus_descontinuado_pais (pais_id);
alter table skus_descontinuado_pais enable row level security;
