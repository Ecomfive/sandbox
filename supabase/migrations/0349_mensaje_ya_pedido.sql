-- Confirmación con IA (21 nov 2026, pedido de Jhokser): antes de escribirle al cliente para pedirle un dato de la dirección o avisarle del pago por adelantado, el sistema lee su chat de iComfly
-- y mira si el bot o un asesor ya se lo pidió. Eso agrega dos estados de mensaje a `confirmacion_ia_analisis.mensaje_estado`:
--   * `ya_pedido`: en el chat ya se lo habían pedido; no se le escribe.
--   * `sin_comprobar`: no se pudo saber (la IA no estuvo segura o falló); tampoco se le escribe, lo decide una persona.
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0349_rollback.sql
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'confirmacion_ia_analisis'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%mensaje_estado%'
  loop
    execute format('alter table confirmacion_ia_analisis drop constraint %I', r.conname);
  end loop;
end $$;

alter table confirmacion_ia_analisis add constraint confirmacion_ia_analisis_mensaje_estado_check
  check (mensaje_estado in ('no_aplica', 'apagado', 'enviado', 'manual', 'pendiente_plantilla', 'sin_chat', 'error', 'ya_pedido', 'sin_comprobar'));

notify pgrst, 'reload schema';

-- Revisión: debe decir «sí».
select 'la restricción acepta ya_pedido' as que,
  case when exists (
    select 1 from pg_constraint where conrelid = 'confirmacion_ia_analisis'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%ya_pedido%'
  ) then 'sí' else 'NO' end as quedo;
