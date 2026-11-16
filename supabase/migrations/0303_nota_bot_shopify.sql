-- Automatización interna (16 nov 2026, pedido de Hernán): quitar de Shopify la nota que el bot de iComfly deja al crear un pedido («Pedido #… - Venta por bot - WhatsApp +…»), que estorba los tickets de
-- Despacho. `tienda_notas_bot` guarda cada nota detectada (con su texto original, por si hay que recuperarla) y qué pasó; `tiendas.quitar_nota_bot` enciende el borrado por tienda (apagado de entrada:
-- mientras tanto solo detecta y registra, porque la app de Shopify es de solo lectura). Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0303_rollback.sql.

alter table tiendas add column if not exists quitar_nota_bot boolean not null default false;

create table if not exists tienda_notas_bot (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid references tiendas (id) on delete set null,
  dominio text not null,
  shopify_orden_id text not null,
  numero text,
  nota_original text not null,
  nota_nueva text not null default '',
  estado text not null default 'detectada' check (estado in ('detectada', 'borrada', 'error')),
  error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (dominio, shopify_orden_id)
);
create index if not exists tienda_notas_bot_estado on tienda_notas_bot (estado, creado_en desc);
alter table tienda_notas_bot enable row level security;

notify pgrst, 'reload schema';
