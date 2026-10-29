-- Tareas del CRM desde el chat de WhatsApp (29 oct 2026, pedido de Hernán): «avísale cuando llegue el producto que pidió» y tareas con
-- fecha para hablar con un cliente. Usa la tabla de los seguimientos (`tareas_dropshipper`, migración 0066) y le agrega:
--   * el chat de donde sale (`conversacion_id`): una tarea puede ser de un chat que todavía no está en el CRM (sin dropshipper);
--   * el producto y el país que se esperan (`sku_id`, `pais_id`) y las compras que venían en camino al crearla (`compras_esperadas`):
--     la tarea queda «esperando» y se activa (pasa a «pendiente», con fecha de hoy) cuando una de esas compras llega de verdad
--     (tiene fecha de llegada o se completa). `llegada_estimada` es la fecha prometida, para mostrarla mientras tanto;
--   * `activada_en` (cuándo llegó) y `avisada_en` (cuándo se le avisó a su responsable en la campana, para no repetir el aviso).
-- Código: src/lib/crm/tareas.ts, src/lib/crm/tareas-servidor.ts, src/app/(app)/crm-dropshippers/tareas/.
-- Reversa: supabase/rollbacks/0187_rollback.sql

alter table tareas_dropshipper alter column dropshipper_id drop not null;
alter table tareas_dropshipper add column if not exists conversacion_id uuid references whatsapp_conversaciones(id) on delete set null;
alter table tareas_dropshipper add column if not exists sku_id uuid references skus_maestros(id) on delete set null;
alter table tareas_dropshipper add column if not exists pais_id uuid references paises(id) on delete set null;
alter table tareas_dropshipper add column if not exists compras_esperadas uuid[];
alter table tareas_dropshipper add column if not exists llegada_estimada date;
alter table tareas_dropshipper add column if not exists activada_en timestamptz;
alter table tareas_dropshipper add column if not exists avisada_en timestamptz;

-- Una tarea es de un dropshipper, de un chat o de los dos.
alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_con_quien;
alter table tareas_dropshipper add constraint tareas_dropshipper_con_quien check (dropshipper_id is not null or conversacion_id is not null);

alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_estado_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_estado_check check (estado in ('pendiente', 'hecha', 'esperando'));
alter table tareas_dropshipper drop constraint if exists tareas_dropshipper_origen_check;
alter table tareas_dropshipper add constraint tareas_dropshipper_origen_check check (origen in ('manual', 'escalado', 'chat', 'llegada'));

create index if not exists tareas_dropshipper_esperando on tareas_dropshipper (creado_en) where estado = 'esperando';
create index if not exists tareas_dropshipper_conversacion on tareas_dropshipper (conversacion_id, estado);
