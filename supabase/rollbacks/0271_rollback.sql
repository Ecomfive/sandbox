-- Reversa de 0271_dunamixfy_competencia.sql: borra las lecturas del Marketplace de Dunamixfy. Las de Dropi, Drop y Effi no se tocan.
do $$
declare c text;
begin
  if to_regclass('competencia_verificaciones') is null then
    return;
  end if;
  delete from competencia_verificaciones where plataforma = 'dunamixfy';
  for c in select conname from pg_constraint where conrelid = 'competencia_verificaciones'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%plataforma%' loop
    execute format('alter table competencia_verificaciones drop constraint %I', c);
  end loop;
  alter table competencia_verificaciones add constraint competencia_verificaciones_plataforma_check check (plataforma in ('dropi', 'drop', 'effi'));
end $$;

drop table if exists dunamixfy_competencia_alertas;
drop table if exists dunamixfy_competencia_historial;
drop table if exists dunamixfy_competencia_productos;
drop table if exists dunamixfy_competencia_busquedas;
