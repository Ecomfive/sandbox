-- Gestión de tienda › Logística: las guías de Servientrega (interior) leídas de SISCORE, su portal de clientes (pedido de Hernán, 12 nov 2026).
-- La extensión «Ecomfive · Dropi» (lector `siscore`) lee, con la sesión que la persona abrió en esa pestaña, el informe de guías de la cuenta de la
-- tienda (Kenku primero) y el rastreo de cada guía, y el sistema lo guarda aquí. SOLO LECTURA de SISCORE: nunca se anula, crea ni cambia nada allá.
--
--   tienda_guias           una fila por guía: la tienda, el pedido (por la «Factura», que es el número de Shopify), el estado y su grupo
--                          (entregado, devuelto, novedad, en ruta), las fechas, lo que se cobra, las visitas sin entregar y el rastreo completo.
--   tienda_guias_lecturas  cada lectura (quién, cuándo, cuántas guías, el error si falló), para no correr dos a la vez.
--
-- Sin el nombre ni la dirección del destinatario: ya están en el pedido. RLS activado y sin políticas: solo el servidor.

create table if not exists tienda_guias (
  guia text primary key check (guia ~ '^[0-9A-Za-z-]{4,40}$'),
  tienda_id uuid references tiendas(id) on delete set null,
  cliente text not null,
  numero_pedido text,
  orden_id uuid references ven_ordenes(id) on delete set null,
  destino text,
  servicio text,
  proceso text,
  estado text,
  estado_grupo text not null default 'en_ruta' check (estado_grupo in ('entregado', 'devuelto', 'novedad', 'en_ruta')),
  fecha_estado date,
  fecha_emision date,
  recaudo numeric(12, 2),
  visitas_sin_entregar integer not null default 0,
  ultimo_motivo text,
  entregada_en text,
  historial jsonb not null default '[]'::jsonb,
  leida_en timestamptz not null default now()
);
create index if not exists tienda_guias_orden on tienda_guias (orden_id);
create index if not exists tienda_guias_tienda on tienda_guias (tienda_id, fecha_emision desc);
alter table tienda_guias enable row level security;
comment on table tienda_guias is 'Logística de tienda: guías de Servientrega leídas de SISCORE (solo lectura), enlazadas a ven_ordenes por la Factura.';

create table if not exists tienda_guias_lecturas (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'corriendo' check (estado in ('corriendo', 'listo', 'error')),
  cliente text,
  inicio timestamptz not null default now(),
  fin timestamptz,
  resumen jsonb,
  error text check (error is null or length(error) <= 500),
  iniciado_por uuid references perfiles(id) on delete set null,
  iniciado_por_nombre text
);
create index if not exists tienda_guias_lecturas_inicio on tienda_guias_lecturas (inicio desc);
alter table tienda_guias_lecturas enable row level security;

notify pgrst, 'reload schema';
