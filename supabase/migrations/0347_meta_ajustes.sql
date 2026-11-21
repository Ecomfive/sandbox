-- Anuncios Meta: ajustes que se cambian desde la pantalla, empezando por pausar o reanudar el análisis automático de videos (el que corre cada 10 minutos).
-- 21 nov 2026, pedido de Jhokser: la cuenta de Gemini quedó suspendida y hace falta poder pausar ese análisis (y reanudarlo) con un botón, no desde el chat.
-- `meta_ajustes` es clave/valor: `valor` es jsonb. El análisis automático se llama `analisis_automatico` y su valor es { "activo": true | false }.
-- Esta migración lo deja EN PAUSA; se reanuda con el botón de Videos. RLS activado y sin políticas (solo el servidor).

create table if not exists meta_ajustes (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  actualizado_por uuid,
  actualizado_por_nombre text,
  actualizado_en timestamptz not null default now()
);
alter table meta_ajustes enable row level security;

insert into meta_ajustes (clave, valor, actualizado_por_nombre)
values ('analisis_automatico', '{"activo": false}'::jsonb, 'Migración 0347 (cuenta de Gemini suspendida)')
on conflict (clave) do nothing;
