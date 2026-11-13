-- Gestión de tienda: la conexión de cada tienda con iComfly (13 nov 2026, pedido de Hernán; prototipo «Chat de tiendas con iComfly» aprobado). iComfly es el bot de
-- WhatsApp de las tiendas (cada tienda con su número); su «Conector Claude» es un servidor MCP con OAuth (registro dinámico, PKCE, código y renovación). El sistema
-- se conecta como un cliente más: un administrador pega la dirección del conector de la tienda y autoriza en iComfly con su token; aquí quedan el cliente
-- registrado y los tokens, **cifrados** (AES-256-GCM, `src/lib/seguridad/cifrado-tokens.ts`). Con RLS y sin políticas: solo el servidor.
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0284_rollback.sql

create table if not exists tienda_icomfly (
  tienda_id uuid primary key references tiendas (id) on delete cascade,
  -- La «URL del servidor MCP» de la tienda en iComfly › Conector Claude (https://api.icomfly.com/mcp/c_…).
  mcp_url text not null check (mcp_url ~ '^https://api\.icomfly\.com/mcp/[A-Za-z0-9_-]{6,80}$'),
  -- El cliente OAuth registrado en iComfly para esa dirección de retorno (se vuelve a registrar si cambia, p. ej. de prueba a producción).
  client_id text,
  redirect_uri text,
  -- Mientras se autoriza: el verificador PKCE (cifrado).
  pkce_cifrado text,
  access_cifrado text,
  refresh_cifrado text,
  expira_en timestamptz,
  conectado_en timestamptz,
  conectado_por uuid references perfiles (id) on delete set null,
  -- Lo que dijo iComfly en la última prueba («Kenku Panamá · 394 funciones») o el último error.
  ultima_prueba text,
  ultimo_error text,
  actualizado_en timestamptz not null default now()
);
alter table tienda_icomfly enable row level security;

notify pgrst, 'reload schema';
