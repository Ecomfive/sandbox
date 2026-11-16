-- Confirmación con IA › revisión del equipo (16 nov 2026, pedido de Hernán): los asesores marcan con botones lo correcto de un pedido analizado (los que las IA no pudieron decidir y los que ya
-- salieron «listos» o «falta un dato», por si algo está mal etiquetado) y esa respuesta vuelve a la IA como ejemplo.
--   * `confirmacion_ia_analisis.rev_*`: lo que dijo el equipo (completa, zona o lo que falta), si coincide con lo que había propuesto el sistema (`rev_ok`; null = no había propuesta), quién y cuándo.
--     `rev_ejemplo_id` es el ejemplo que esa respuesta creó (se cambia si la respuesta se corrige y se borra si se deja «está bien»).
--   * `confirmacion_ia_ejemplos.origen`: de dónde salió un ejemplo («manual» o «revision»).
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0307_rollback.sql.

alter table confirmacion_ia_ejemplos add column if not exists origen text not null default 'manual' check (origen in ('manual', 'revision'));

alter table confirmacion_ia_analisis add column if not exists rev_completa boolean;
alter table confirmacion_ia_analisis add column if not exists rev_zona text check (rev_zona is null or rev_zona in ('ciudad', 'interior'));
alter table confirmacion_ia_analisis add column if not exists rev_falta text check (rev_falta is null or char_length(rev_falta) <= 200);
alter table confirmacion_ia_analisis add column if not exists rev_ok boolean;
alter table confirmacion_ia_analisis add column if not exists rev_por uuid;
alter table confirmacion_ia_analisis add column if not exists rev_por_nombre text;
alter table confirmacion_ia_analisis add column if not exists rev_en timestamptz;
alter table confirmacion_ia_analisis add column if not exists rev_ejemplo_id uuid references confirmacion_ia_ejemplos (id) on delete set null;
create index if not exists confirmacion_ia_analisis_revision on confirmacion_ia_analisis (pais_id, rev_en desc) where rev_en is not null;

notify pgrst, 'reload schema';
