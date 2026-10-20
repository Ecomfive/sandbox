-- Testing Lab › Producción › «Generador de landings» (pedido de Hernán, 20 oct 2026): la landing del test de un producto, armada
-- en el sistema (desde cero o tomando otra como modelo) con sus imágenes, textos y secciones, y una vista previa. Va después de
-- Creación de ofertas. Hoy las imágenes se suben a mano y los textos se escriben; luego llegan Gemini (imágenes), Claude (textos)
-- y la publicación en Shopify. Va por país. Se puede repetir.

create table if not exists landings (
  id uuid primary key default uuid_v7(),
  -- El N.º de la landing (LND-0001).
  numero integer not null,
  pais_id uuid not null references paises(id),
  -- El producto de Selección del que sale (sus ofertas y su foto). Puede no tener.
  seleccion_id uuid references wms_seleccion_productos(id) on delete set null,
  nombre text not null,
  modo text not null default 'cero' check (modo in ('cero', 'clonar')),
  -- La landing que se toma de modelo (modo «clonar») y lo que se leyó de ella (título, encabezados e imágenes, en orden).
  referencia_url text,
  referencia jsonb,
  angulo text not null default 'regalo',
  notas_ia text,
  -- La moneda de la tienda del país (USD, CRC…) y los precios de la landing en esa moneda.
  moneda text not null default 'USD',
  precio numeric(14, 2) check (precio is null or precio >= 0),
  precio_tachado numeric(14, 2) check (precio_tachado is null or precio_tachado >= 0),
  -- Textos y secciones (titular, beneficios, preguntas, reseñas reales, orden y visibilidad de cada bloque).
  contenido jsonb not null default '{}'::jsonb,
  -- Una imagen por espacio de la landing ({ portada: { ruta, instruccion } , …}), en el bucket privado `landings`.
  imagenes jsonb not null default '{}'::jsonb,
  -- Las fotos del proveedor que sirven de referencia para generar las imágenes (rutas en el mismo bucket).
  fotos_proveedor jsonb not null default '[]'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'lista', 'publicada')),
  -- Lo de Shopify cuando se conecte (tienda, id del producto, enlace).
  shopify jsonb,
  creado_por uuid references perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create sequence if not exists landings_numero_seq owned by landings.numero;
alter table landings alter column numero set default nextval('landings_numero_seq');
create unique index if not exists landings_numero_uidx on landings (numero);
create index if not exists landings_pais_idx on landings (pais_id, actualizado_en desc);
create index if not exists landings_seleccion_idx on landings (seleccion_id);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table landings enable row level security;

-- Las imágenes: bucket privado (se ven con enlaces firmados). Hasta 10 MB por imagen.
insert into storage.buckets (id, name, public) values ('landings', 'landings', false)
on conflict (id) do nothing;
update storage.buckets set file_size_limit = 10485760 where id = 'landings';

-- Quien tenía Creación de ofertas recibe el módulo nuevo con su mismo solo lectura; después se ajusta por rol.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'generador-landings', solo_lectura from permisos_rol where modulo = 'creacion-ofertas'
on conflict (rol_id, modulo) do nothing;
