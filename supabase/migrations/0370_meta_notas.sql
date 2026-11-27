-- Notas de Anuncios Meta (26 nov 2026, pedido de Hernán): lo que el equipo quiere rescatar de los análisis para futuras campañas. Se escriben desde el botón flotante de notas
-- o desde «Anotar» en cualquier sugerencia (entonces guardan de dónde salieron). Cada nota se cierra con «Ya lo hice», «Dejar para después» (vuelve sola a los 7 días) o «No aplica».
-- Son del país, para todo el equipo que abre Anuncios Meta. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0370_rollback.sql

create table if not exists meta_notas (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises (id) on delete cascade,
  texto text not null check (length(texto) between 1 and 2000),
  -- La sugerencia de donde salió (si se anotó desde una) y su texto de ese momento.
  origen_clave text check (origen_clave is null or length(origen_clave) <= 120),
  origen_texto text check (origen_texto is null or length(origen_texto) <= 600),
  -- abierta · hecha («Ya lo hice») · pospuesta (hasta `pospuesta_hasta`) · descartada («No aplica»).
  estado text not null default 'abierta' check (estado in ('abierta', 'hecha', 'pospuesta', 'descartada')),
  pospuesta_hasta date,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  cerrado_por uuid,
  cerrado_por_nombre text,
  cerrado_en timestamptz
);
create index if not exists meta_notas_pais_idx on meta_notas (pais_id, creado_en desc);

-- Solo el servidor (clave de servicio) la lee y la escribe.
alter table meta_notas enable row level security;

notify pgrst, 'reload schema';

-- Revisión: debe decir «meta_notas lista».
select case when to_regclass('public.meta_notas') is not null then 'meta_notas lista' else 'FALTA meta_notas' end as revision;
