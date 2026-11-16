-- Confirmación con IA (16 nov 2026, pedido de Hernán). Cuando iComfly deja el pedido «Confirmada» en Shopify, el sistema analiza la dirección (con ChatGPT y Claude): decide si es de
-- ciudad o de interior (Servientrega) y si está completa; si falta algo, le pide el dato al cliente por WhatsApp (iComfly). Por ahora no cambia etiquetas en Shopify: solo propone.
-- Cuatro tablas, todas por país y con RLS sin políticas (solo el servidor las toca):
--   * confirmacion_ia_config: el interruptor de cada país (apagado de entrada), si se manda el WhatsApp, si el país distingue ciudad e interior y qué etiquetas usa.
--   * confirmacion_ia_ejemplos: direcciones completas e incompletas que el equipo va agregando (con lo que faltaba), para que la IA aprenda.
--   * confirmacion_ia_zonas: palabras de zona (una sola o varias juntas) que deciden si una dirección es de ciudad o del interior.
--   * confirmacion_ia_analisis: lo que se analizó de cada pedido (uno por pedido) y qué pasó con el mensaje.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0300_rollback.sql.

create table if not exists confirmacion_ia_config (
  pais_id uuid primary key references paises (id) on delete cascade,
  activa boolean not null default false,
  enviar_mensajes boolean not null default false,
  distingue_zona boolean not null default false,
  etiqueta_ciudad text,
  etiqueta_interior text,
  clave_cambio_hash text,
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);
alter table confirmacion_ia_config enable row level security;

create table if not exists confirmacion_ia_ejemplos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises (id) on delete cascade,
  tienda_id uuid references tiendas (id) on delete set null,
  direccion text not null check (char_length(direccion) between 5 and 600),
  completa boolean not null,
  falta text check (falta is null or char_length(falta) <= 200),
  zona text check (zona in ('ciudad', 'interior')),
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists confirmacion_ia_ejemplos_pais on confirmacion_ia_ejemplos (pais_id, creado_en desc);
alter table confirmacion_ia_ejemplos enable row level security;

create table if not exists confirmacion_ia_zonas (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises (id) on delete cascade,
  texto text not null check (char_length(texto) between 2 and 80),
  clave text not null,
  resultado text not null check (resultado in ('ciudad', 'interior')),
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  unique (pais_id, clave)
);
alter table confirmacion_ia_zonas enable row level security;

create table if not exists confirmacion_ia_analisis (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null unique references ven_ordenes (id) on delete cascade,
  pais_id uuid not null references paises (id) on delete cascade,
  tienda_id uuid references tiendas (id) on delete set null,
  origen text not null default 'webhook' check (origen in ('webhook', 'pantalla', 'pendientes')),
  -- Lo que se analizó, y su huella: si el cliente corrige la dirección, cambia y se vuelve a analizar.
  direccion text,
  ciudad text,
  huella text not null,
  estado text not null check (estado in ('listo', 'falta_dato', 'revisar', 'error')),
  zona text check (zona in ('ciudad', 'interior')),
  zona_por text check (zona_por in ('regla', 'ia')),
  completa boolean,
  falta text,
  etiqueta text,
  acuerdo boolean,
  motivo text,
  modelos jsonb not null default '[]',
  reglas jsonb not null default '[]',
  mensaje text,
  mensaje_estado text not null default 'no_aplica' check (mensaje_estado in ('no_aplica', 'apagado', 'enviado', 'pendiente_plantilla', 'sin_chat', 'error')),
  mensaje_error text,
  mensajes_enviados integer not null default 0,
  mensaje_enviado_en timestamptz,
  analizado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists confirmacion_ia_analisis_pais on confirmacion_ia_analisis (pais_id, actualizado_en desc);
alter table confirmacion_ia_analisis enable row level security;

-- Panamá: distingue ciudad de interior y usa CIUDAD e INTERIOR/SERVIENTREGA. Los demás países se configuran cuando se confirme cómo trabajan (Costa Rica queda pendiente).
insert into confirmacion_ia_config (pais_id, distingue_zona, etiqueta_ciudad, etiqueta_interior)
select id, true, 'CIUDAD', 'INTERIOR/SERVIENTREGA' from paises where codigo = 'PA'
on conflict (pais_id) do nothing;

-- Las palabras de zona que dio Hernán de ejemplo (Panamá); el equipo agrega el resto desde la pantalla.
insert into confirmacion_ia_zonas (pais_id, texto, clave, resultado, creado_por_nombre)
select p.id, v.texto, v.clave, v.resultado, 'Sistema'
from paises p
cross join (values
  ('Colón', 'colon', 'interior'),
  ('Panamá Este', 'panama este', 'interior'),
  ('Panamá Oeste', 'panama oeste', 'interior'),
  ('Ciudad de Panamá', 'ciudad de panama', 'ciudad')
) as v (texto, clave, resultado)
where p.codigo = 'PA'
on conflict (pais_id, clave) do nothing;

notify pgrst, 'reload schema';
