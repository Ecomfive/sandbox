-- Despacho ciudad y Devoluciones: archivar una fila (16 nov 2026, pedido de Hernán, antes de empezar a trabajar en el sistema el lunes 17). Una fila creada
-- por error o que sobra no se borra: se archiva. Sale del tablero, se suelta del pedido (`orden_id` vacío, para que no cuente en sus entregas ni en
-- Cobros) y se puede ver y restaurar desde «Archivados». La lectura de Monday no la vuelve a traer (queda con `editado_en`).
--
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0971_rollback.sql

alter table mon_despachos add column if not exists archivado_en timestamptz;
alter table mon_despachos add column if not exists archivado_por uuid references perfiles(id) on delete set null;

create index if not exists mon_despachos_archivados on mon_despachos (clase, archivado_en desc) where archivado_en is not null;

notify pgrst, 'reload schema';
