-- CRM: las etiquetas de los dropshippers empiezan de cero (29 oct 2026, pedido de Hernán: «queremos iniciar nuevamente»). Antes de
-- vaciarlas se guarda una copia de las que tenía cada uno en `dropshippers_etiquetas_respaldo` (para poder volver atrás). Al 29 oct eran
-- 397 dropshippers: «Creado desde Dropi» en 372 y nombres de productos en el resto. No toca las etiquetas de los chats ni sus colores.
-- Reversa: supabase/rollbacks/0191_rollback.sql

create table if not exists dropshippers_etiquetas_respaldo (
  dropshipper_id uuid primary key references dropshippers(id) on delete cascade,
  etiquetas text[] not null,
  guardado_en timestamptz not null default now()
);
alter table dropshippers_etiquetas_respaldo enable row level security;

insert into dropshippers_etiquetas_respaldo (dropshipper_id, etiquetas)
select id, etiquetas from dropshippers where etiquetas <> '{}'
on conflict (dropshipper_id) do nothing;

update dropshippers set etiquetas = '{}' where etiquetas <> '{}';
