-- Reversa de 0349_mensaje_ya_pedido.sql: los análisis con «ya_pedido» o «sin_comprobar» vuelven a «no_aplica» y la restricción deja los estados de la 0308.
update confirmacion_ia_analisis set mensaje_estado = 'no_aplica' where mensaje_estado in ('ya_pedido', 'sin_comprobar');
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
