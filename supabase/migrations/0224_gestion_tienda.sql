-- Gestión de tienda (pedido de Hernán, 3 nov 2026): el panel de las tiendas de Shopify dentro del sistema, como la app de Mi Reto Digital, pero
-- primero solo la estructura: las tablas quedan vacías hasta conectar Shopify (etapa 2), una tienda a la vez y empezando por Kenku (Panamá, USD).
-- La conexión será SOLO DE LECTURA: el sistema nunca crea, edita ni cancela nada en Shopify (las tiendas están operando y no se puede tocar el despacho).
--
--   tiendas                 una fila por tienda (Kenku, Nuvo, Wao Ofertas, Ofertfy…), con su país, su moneda y el estado de la conexión.
--   tienda_variantes        cada variante de Shopify de una tienda y el producto nuestro (skus_maestros) al que se vincula a mano: el SKU de Shopify
--                           puede ser distinto al nuestro y no se cambia en Shopify; la unión vive aquí.
--   tienda_pedidos          los pedidos de Shopify (llegarán por los avisos de Shopify y una revisión cada 10 min), con su estado para el panel.
--   tienda_pedido_lineas    los productos de cada pedido (variante de Shopify, SKU, cantidad y precio).
--   tienda_pedido_notas     las notas internas del equipo (no van a Shopify).
--   tienda_avisos           la bitácora de avisos de Shopify (webhooks) que llegan, para ver si la conexión está al día.
--
-- Solo el servidor lee y escribe (RLS sin políticas). El módulo lo reciben los roles que administran Usuarios y roles. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0224_rollback.sql

create table if not exists tiendas (
  id uuid primary key default uuid_v7(),
  nombre text not null check (char_length(nombre) between 1 and 80),
  plataforma text not null default 'shopify' check (plataforma in ('shopify')),
  pais_id uuid not null references paises(id),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  -- El dominio de la tienda en Shopify («kenku.myshopify.com»), cuando se conecte.
  dominio text check (dominio is null or dominio ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  estado text not null default 'por_conectar' check (estado in ('por_conectar', 'conectada', 'pausada')),
  -- Siempre lectura: queda escrito para que se vea en la pantalla de Tiendas.
  permiso text not null default 'lectura' check (permiso in ('lectura')),
  conectada_en timestamptz,
  ultimo_aviso_en timestamptz,
  ultima_revision_en timestamptz,
  -- La conciliación: cuántos pedidos tiene el sistema y cuántos Shopify, y cuándo se comparó.
  pedidos_sistema integer,
  pedidos_shopify integer,
  conciliado_en timestamptz,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  unique (pais_id, nombre)
);

create table if not exists tienda_variantes (
  id uuid primary key default uuid_v7(),
  tienda_id uuid not null references tiendas(id) on delete cascade,
  shopify_variante_id bigint not null,
  shopify_producto_id bigint not null,
  producto_titulo text not null,
  variante_titulo text,
  sku text,
  precio numeric(12, 2) check (precio is null or precio >= 0),
  foto_url text,
  foto_huella text,
  estado_shopify text,
  -- El producto nuestro: lo confirma una persona (o queda marcado como algo que no sale de bodega: garantía, envío prioritario…).
  sku_maestro_id uuid references skus_maestros(id) on delete set null,
  no_fisico boolean not null default false,
  vinculado_por uuid references perfiles(id) on delete set null,
  vinculado_en timestamptz,
  en_shopify boolean not null default true,
  primera_vez timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tienda_id, shopify_variante_id),
  check (not (no_fisico and sku_maestro_id is not null))
);

create index if not exists tienda_variantes_sku_idx on tienda_variantes (sku_maestro_id) where sku_maestro_id is not null;

create table if not exists tienda_pedidos (
  id uuid primary key default uuid_v7(),
  tienda_id uuid not null references tiendas(id) on delete cascade,
  shopify_pedido_id bigint not null,
  numero text not null,
  creado_shopify timestamptz not null,
  cliente_nombre text,
  cliente_telefono text,
  provincia text,
  ciudad text,
  direccion text,
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  subtotal numeric(12, 2),
  descuentos numeric(12, 2),
  envio numeric(12, 2),
  total numeric(12, 2) not null default 0,
  -- Las unidades de todas sus líneas (se calculan al guardarlo), para las cuentas del tablero sin leer las líneas.
  unidades integer not null default 0 check (unidades >= 0),
  -- El estado del panel: nuevo (sin confirmar), confirmado, en camino (con guía), entregado, cancelado o devuelto.
  estado text not null default 'nuevo' check (estado in ('nuevo', 'confirmado', 'en_camino', 'entregado', 'cancelado', 'devuelto')),
  estado_pago text,
  estado_envio text,
  transportista text,
  guia text,
  cancelado_en timestamptz,
  motivo text,
  etiquetas text[] not null default '{}',
  -- Lo que mandó Shopify, tal cual, por si hace falta releerlo.
  crudo jsonb,
  recibido_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tienda_id, shopify_pedido_id)
);

create index if not exists tienda_pedidos_fecha_idx on tienda_pedidos (tienda_id, creado_shopify desc);
create index if not exists tienda_pedidos_estado_idx on tienda_pedidos (tienda_id, estado);

create table if not exists tienda_pedido_lineas (
  id uuid primary key default uuid_v7(),
  pedido_id uuid not null references tienda_pedidos(id) on delete cascade,
  shopify_linea_id bigint not null,
  shopify_variante_id bigint,
  titulo text not null,
  variante_titulo text,
  sku text,
  cantidad integer not null check (cantidad > 0),
  precio numeric(12, 2) not null default 0,
  unique (pedido_id, shopify_linea_id)
);

create index if not exists tienda_pedido_lineas_variante_idx on tienda_pedido_lineas (shopify_variante_id);

create table if not exists tienda_pedido_notas (
  id uuid primary key default uuid_v7(),
  pedido_id uuid not null references tienda_pedidos(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 2000),
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text,
  creado_en timestamptz not null default now()
);

create index if not exists tienda_pedido_notas_pedido_idx on tienda_pedido_notas (pedido_id, creado_en);

create table if not exists tienda_avisos (
  id uuid primary key default uuid_v7(),
  tienda_id uuid references tiendas(id) on delete cascade,
  -- El tema del aviso de Shopify («orders/create», «orders/updated»…) y el id de lo que cambió.
  topico text not null,
  shopify_id bigint,
  firma_ok boolean not null default false,
  recibido_en timestamptz not null default now(),
  procesado_en timestamptz,
  error text
);

create index if not exists tienda_avisos_tienda_idx on tienda_avisos (tienda_id, recibido_en desc);

alter table tiendas enable row level security;
alter table tienda_variantes enable row level security;
alter table tienda_pedidos enable row level security;
alter table tienda_pedido_lineas enable row level security;
alter table tienda_pedido_notas enable row level security;
alter table tienda_avisos enable row level security;

-- Kenku, la primera (Panamá, en dólares). Las demás se suman cuando les toque.
insert into tiendas (nombre, pais_id, moneda, orden)
select 'Kenku', p.id, 'USD', 1 from paises p where p.codigo = 'PA'
on conflict (pais_id, nombre) do nothing;

-- Los cuatro módulos, para quien administra Usuarios y roles (después se reparten en la matriz de cada rol).
insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, m.modulo, false
from permisos_rol pr
cross join (values ('tienda-dashboard'), ('tienda-pedidos'), ('tienda-productos'), ('tienda-tiendas')) as m (modulo)
where pr.modulo = 'usuarios' and not pr.solo_lectura
on conflict (rol_id, modulo) do nothing;
