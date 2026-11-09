-- Portal AF4 360°: «Deshacer» y «nuevas vs actualizadas» en todos los importadores (antes solo el libro, migración 0925).
--
-- Cada tabla que escribe un importador guarda qué importación creó la fila (`importacion_id`). El libro la pone al
-- insertar; los demás la marcan al cerrar la bitácora: las filas con huella creadas desde que se abrió la importación y
-- que no son de otra (`src/lib/importar/bitacora-actions.ts`). Deshacer borra solo eso, nunca lo corregido a mano, lo de
-- un mes cerrado ni lo protegido (semanas cerradas con un repartidor, líneas conciliadas, cobros emparejados, documentos
-- con abonos del portal). Una tabla que todavía no existe se salta. Se puede correr dos veces.

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'fin_cartera', 'fin_bienes_uso', 'fin_costos_lotes', 'nom_lineas', 'ven_ordenes', 'del_entregas',
    'conc_lineas', 'conc_fuentes_cobro', 'conc_ordenes'
  ] loop
    if to_regclass(v_tabla) is null then
      continue;
    end if;
    execute format('alter table %I add column if not exists importacion_id uuid', v_tabla);
    if not exists (select 1 from pg_constraint where conname = v_tabla || '_importacion_fk') then
      execute format(
        'alter table %I add constraint %I foreign key (importacion_id) references fin_importaciones(id) on delete set null',
        v_tabla, v_tabla || '_importacion_fk'
      );
    end if;
    execute format('create index if not exists %I on %I (importacion_id) where importacion_id is not null', v_tabla || '_importacion', v_tabla);
    -- Para marcar lo creado por una importación (por su fecha de creación) sin recorrer toda la tabla.
    execute format('create index if not exists %I on %I (creado_en) where importacion_id is null', v_tabla || '_creado_sin_importacion', v_tabla);
  end loop;
end $$;

-- Marcar una fila de un mes cerrado con su importación no cambia su contenido contable: el bloqueo del cierre la ignora,
-- como ya ignoraba `actualizado_en` y `regla_id`.
create or replace function fin_bloqueo_cierre() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_viejo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_nuevo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  -- Columnas que cambian sin tocar el contenido contable.
  v_ignorar text[] := array['actualizado_en', 'regla_id', 'importacion_id'];
  v_fila jsonb;
  v_mes date;
  v_que text;
begin
  if tg_op = 'UPDATE' and (v_viejo - v_ignorar) = (v_nuevo - v_ignorar) then
    return new;
  end if;
  v_que := case tg_table_name
    when 'fin_movimientos' then 'movimientos del libro'
    when 'fin_base_distribucion' then 'base de reparto'
    when 'fin_saldos_iniciales' then 'saldos iniciales'
    when 'nom_lineas' then 'líneas de nómina'
    when 'nom_periodos' then 'meses de nómina'
    else tg_table_name
  end;
  foreach v_fila in array array_remove(array[v_viejo, v_nuevo], null) loop
    foreach v_mes in array fin_meses_de_fila(tg_table_name, v_fila) loop
      if fin_mes_cerrado(v_mes) then
        raise exception using
          errcode = 'FC001',
          message = format(
            'El mes %s está cerrado: no se pueden agregar, cambiar ni borrar sus %s. Para corregirlo hay que reabrirlo en Cierre de mes.',
            fin_nombre_mes(v_mes), v_que
          ),
          hint = 'Finanzas › Cierre de mes › Reabrir (con motivo).';
      end if;
    end loop;
  end loop;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

revoke all on function fin_bloqueo_cierre() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_bloqueo_cierre() from anon, authenticated';
  end if;
end $$;
