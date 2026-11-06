-- Uso del sistema › tiempo fuera del sistema (6 nov 2026, pedido de Hernán): cuántos minutos pasa cada persona en Dropi, Effi, Drop y Shopify y en qué sección,
-- para saber qué hay que traer al sistema antes de mudarnos. Lo manda la extensión «Ecomfive · Uso» (`extension/ecomfive-uso`) con la sesión de la persona: un
-- renglón por minuto activo en una de esas plataformas, sin contenido de las páginas ni números de pedido. `uso_externo_extensiones` dice quién la tiene puesta:
-- sin ella, cero minutos no significa que no use la plataforma.
-- RLS sin políticas: solo el servidor la lee y la escribe. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0240_rollback.sql

create table if not exists uso_externo_minutos (
  usuario_id uuid not null references perfiles (id) on delete cascade,
  minuto timestamptz not null,
  plataforma text not null check (plataforma in ('dropi', 'effi', 'drop', 'shopify')),
  seccion text not null default '' check (char_length(seccion) <= 80),
  primary key (usuario_id, minuto)
);
create index if not exists uso_externo_minutos_minuto_idx on uso_externo_minutos (minuto);
alter table uso_externo_minutos enable row level security;

create table if not exists uso_externo_extensiones (
  usuario_id uuid primary key references perfiles (id) on delete cascade,
  version text check (char_length(version) <= 20),
  visto_en timestamptz not null default now()
);
alter table uso_externo_extensiones enable row level security;
