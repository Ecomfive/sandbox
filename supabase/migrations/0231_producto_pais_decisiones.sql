-- Producto › Por país (5 nov 2026, pedido de Alcides): una tabla con cada producto y, por país, si ya existe allí (publicado en Dropi o Drop,
-- comprado o con stock). Donde todavía no existe, la persona decide «Enviar» (traerlo a ese país) o «Descartado» (con su motivo). Aquí se
-- guarda solo esa decisión: lo demás se calcula con lo que ya tiene el sistema. Solo lo lee y escribe el servidor (RLS sin políticas).
-- Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0231_rollback.sql

create table if not exists producto_pais_decisiones (
  sku_id uuid not null references skus_maestros(id) on delete cascade,
  pais_id uuid not null references paises(id) on delete cascade,
  decision text not null check (decision in ('enviar', 'descartado')),
  motivo text check (motivo is null or char_length(motivo) <= 300),
  decidido_por text,
  decidido_en timestamptz not null default now(),
  primary key (sku_id, pais_id)
);
create index if not exists producto_pais_decisiones_pais_idx on producto_pais_decisiones (pais_id);
alter table producto_pais_decisiones enable row level security;
