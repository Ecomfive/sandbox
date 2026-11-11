-- Portal AF4 360°: webhooks de Shopify (entran las órdenes al instante) y salud de la conexión.
create table if not exists ven_shopify_webhooks (
  webhook_id text primary key,
  tema text not null,
  dominio text not null,
  creado_en timestamptz not null default now()
);
alter table ven_shopify_webhooks enable row level security;
comment on table ven_shopify_webhooks is 'Portal AF4 360°: ids de webhooks de Shopify ya procesados (idempotencia; Shopify reintenta).';

alter table ven_tiendas_conexion add column if not exists ultimo_webhook timestamptz;
alter table ven_tiendas_conexion add column if not exists webhooks_recibidos integer not null default 0;
