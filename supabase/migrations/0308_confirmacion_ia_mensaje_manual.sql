-- Confirmación con IA (16 nov 2026, pedido de Hernán): cuando una persona marca «Falta un dato», el sistema le pregunta en pantalla si quiere mandarle el mensaje al cliente o si ya se
-- lo mandó a mano. Eso agrega el estado de mensaje «manual» (ya se le envió a mano) a la lista de estados de `confirmacion_ia_analisis.mensaje_estado`.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0308_rollback.sql.

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
  check (mensaje_estado in ('no_aplica', 'apagado', 'enviado', 'manual', 'pendiente_plantilla', 'sin_chat', 'error'));

notify pgrst, 'reload schema';
