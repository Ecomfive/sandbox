-- Categorías de producto con la taxonomía estándar de Shopify en español (pedido de Alcides, 19 oct 2026): un árbol público y
-- abierto (github.com/Shopify/product-taxonomy), la evolución del de Google que usan Meta y Google Shopping. La tabla guarda
-- todo el árbol (~14 600 categorías; la carga `scripts/cargar-taxonomia-shopify.ts`) y cada producto apunta a una.

create table if not exists categorias_productos (
  -- El id corto de Shopify: «hb-3-2-9» (gid://shopify/TaxonomyCategory/hb-3-2-9).
  id text primary key,
  -- La ruta completa: «Salud y belleza > Cuidado personal > Cosméticos > Cuidado de la piel».
  ruta text not null,
  nombre text not null,
  nivel smallint not null,
  padre text references categorias_productos (id)
);
alter table categorias_productos enable row level security;
create index if not exists categorias_productos_padre_idx on categorias_productos (padre);

alter table skus_maestros add column if not exists categoria_id text references categorias_productos (id);
-- La puso la clasificación automática por foto y nombre («ia») o una persona («manual»).
alter table skus_maestros add column if not exists categoria_origen text check (categoria_origen in ('ia', 'manual'));
-- La clasificación no estaba segura (podía ir en dos categorías, sin foto clara): para revisar a mano.
alter table skus_maestros add column if not exists categoria_revisar boolean not null default false;
create index if not exists skus_maestros_categoria_idx on skus_maestros (categoria_id);
