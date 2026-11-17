-- Confirmación con IA (17 nov 2026, pedido del equipo): «Pago por adelantado» deja de ser una lista aparte y pasa a ser una opción más de zona, junto a «Ciudad» e «Interior/Servientrega», en las palabras de zona, en las
-- direcciones de ejemplo y en lo que marcan los asesores al revisar. Así todo lo que enseña a la IA está en un solo lugar.
--   * `confirmacion_ia_zonas.resultado`, `confirmacion_ia_ejemplos.zona` y `confirmacion_ia_analisis.rev_zona` admiten «adelantado».
--   * Lo que hubiera en `confirmacion_ia_adelanto_zonas` (0312, vacía hasta hoy) pasa a las palabras de zona como «adelantado» y esa tabla se quita.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0313_rollback.sql

do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tabla, conname from pg_constraint
    where contype = 'c' and (
      (conrelid = 'confirmacion_ia_zonas'::regclass and pg_get_constraintdef(oid) ilike '%resultado%ciudad%')
      or (conrelid = 'confirmacion_ia_ejemplos'::regclass and pg_get_constraintdef(oid) ilike '%zona%ciudad%')
      or (conrelid = 'confirmacion_ia_analisis'::regclass and pg_get_constraintdef(oid) ilike '%rev_zona%')
    )
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
  end loop;
end $$;

alter table confirmacion_ia_zonas add constraint confirmacion_ia_zonas_resultado_check check (resultado in ('ciudad', 'interior', 'adelantado'));
alter table confirmacion_ia_ejemplos add constraint confirmacion_ia_ejemplos_zona_check check (zona is null or zona in ('ciudad', 'interior', 'adelantado'));
alter table confirmacion_ia_analisis add constraint confirmacion_ia_analisis_rev_zona_check check (rev_zona is null or rev_zona in ('ciudad', 'interior', 'adelantado'));

do $$
begin
  if to_regclass('confirmacion_ia_adelanto_zonas') is not null then
    insert into confirmacion_ia_zonas (pais_id, texto, clave, resultado, creado_por, creado_por_nombre, creado_en)
    select pais_id, texto, clave, 'adelantado', creado_por, creado_por_nombre, creado_en from confirmacion_ia_adelanto_zonas
    on conflict (pais_id, clave) do nothing;
    drop table confirmacion_ia_adelanto_zonas;
  end if;
end $$;

notify pgrst, 'reload schema';
