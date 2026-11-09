-- Portal AF4 360° — Finanzas › Cierre de mes (/cierre-mes).
--
-- Hasta ahora cualquiera podía cambiar un mes ya reportado. El cierre contable mensual pasa por tres estados:
--   abierto → en_revision (alguien lo envía a revisión) → cerrado (con el checklist en verde o cada excepción
--   justificada) · y cerrado → abierto solo al reabrirlo (quien puede modificar Usuarios y roles, con motivo).
-- Al cerrar se guarda una FOTOGRAFÍA (jsonb) del EERR consolidado y por tienda, del flujo y de los saldos de cartera,
-- para ver después si algo cambió. El checklist se evalúa solo contra los datos (`src/lib/finanzas/cierre.ts`) y cada
-- tarea se puede marcar a mano (`fin_cierre_tareas`).
--
-- BLOQUEO (en la base, para que ninguna pantalla, importación ni script se lo salte): un disparador rechaza agregar,
-- cambiar o borrar filas de un mes cerrado en las tablas que alimentan el EERR, el flujo y el checklist:
--   · fin_movimientos: el mes del libro (`periodo`, EERR) y el mes de pago (`fecha_pago`, o el del libro si falta: es
--     el mes en que cae en el flujo). Si cualquiera de los dos está cerrado, la fila no se toca.
--   · fin_base_distribucion (`periodo`): reparte A DISTRIBUIR entre las tiendas; cambiarla cambia el EERR por tienda.
--   · fin_saldos_iniciales (`fecha`): el saldo con que abre el mes cambia la caja de ese mes.
--   · nom_periodos y nom_lineas (`periodo`): la nómina cerrada es la que se concilió con el libro.
-- NO se bloquean fin_cartera ni fin_cartera_abonos: la cartera es un saldo vivo (el estado incobrable/anulado de un
-- documento cambia meses después, los abonos del Excel llegan sin fecha y se registran tarde), así que bloquear solo los
-- abonos daría una falsa seguridad. Su saldo al cierre queda en la fotografía y la página marca si cambió.
-- Una actualización que no cambia nada (salvo `actualizado_en` o `regla_id`, que el borrado de una regla pone en null)
-- se deja pasar: reimportar un archivo sin cambios no falla. Las importaciones del libro y de la nómina saltan las filas
-- de meses cerrados y las cuentan en su resumen (`guardar-libro.ts`, `nomina/guardar.ts`).
--
-- RLS activado y sin políticas (ver SEGURIDAD.md): solo el servidor, con la clave de servicio, toca estas tablas.
-- Se puede correr dos veces.

-- ---------------------------------------------------------------------------------------------
-- Cierres
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_cierres (
  id uuid primary key default gen_random_uuid(),
  -- Primer día del mes que se cierra.
  periodo date not null unique check (extract(day from periodo) = 1),
  estado text not null default 'abierto' check (estado in ('abierto', 'en_revision', 'cerrado')),
  notas text check (notas is null or length(notas) <= 2000),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  enviado_revision_en timestamptz,
  enviado_revision_por uuid references auth.users(id),
  cerrado_en timestamptz,
  cerrado_por uuid references auth.users(id),
  reabierto_en timestamptz,
  reabierto_por uuid references auth.users(id),
  motivo_reapertura text,
  -- Cuántas veces se cerró (1 = nunca se reabrió).
  veces_cerrado integer not null default 0,
  -- EERR consolidado y por tienda, flujo y cartera al cerrar (`Fotografia` en cierre.ts).
  fotografia jsonb,
  actualizado_en timestamptz not null default now(),
  check (estado <> 'cerrado' or (cerrado_en is not null and fotografia is not null)),
  check (reabierto_en is null or length(trim(coalesce(motivo_reapertura, ''))) > 0)
);

-- Checklist de cada cierre: una fila por tarea (la clave es la de `TAREAS` en cierre.ts).
create table if not exists fin_cierre_tareas (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null references fin_cierres(id) on delete cascade,
  clave text not null check (clave ~ '^[a-z0-9-]{1,40}$'),
  titulo text not null,
  -- Lo que decidió una persona (a_mano) o, si no, lo que vio el sistema la última vez que se evaluó.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'no_aplica')),
  a_mano boolean not null default false,
  -- Resultado de la evaluación automática al guardarse (ok, revisar, falta, no_disponible) y su detalle.
  automatico text check (automatico is null or automatico in ('ok', 'revisar', 'falta', 'no_disponible')),
  detalle text,
  evaluado_en timestamptz,
  marcado_por uuid references auth.users(id),
  marcado_en timestamptz,
  comentario text check (comentario is null or length(comentario) <= 1000),
  -- «No aplica» siempre se justifica.
  check (estado <> 'no_aplica' or length(trim(coalesce(comentario, ''))) > 0),
  unique (cierre_id, clave)
);

alter table fin_cierres enable row level security;
alter table fin_cierre_tareas enable row level security;

create index if not exists historial_auditoria_fin_cierres
  on historial_auditoria (entidad_id, creado_en desc)
  where entidad = 'fin_cierres';

-- ---------------------------------------------------------------------------------------------
-- Bloqueo de los meses cerrados
-- ---------------------------------------------------------------------------------------------
create or replace function fin_mes_cerrado(p date) returns boolean
language sql stable security definer set search_path = public as $$
  select p is not null and exists (
    select 1 from fin_cierres c where c.periodo = date_trunc('month', p)::date and c.estado = 'cerrado'
  )
$$;

-- «julio de 2026» (sin depender del idioma del servidor).
create or replace function fin_nombre_mes(p date) returns text
language sql immutable as $$
  select (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
                'noviembre', 'diciembre'])[extract(month from p)::int] || ' de ' || extract(year from p)::int
$$;

-- Los meses que toca una fila de cada tabla bloqueada.
create or replace function fin_meses_de_fila(p_tabla text, p_fila jsonb) returns date[]
language sql immutable as $$
  select case p_tabla
    when 'fin_movimientos' then array[
      (p_fila->>'periodo')::date,
      coalesce((p_fila->>'fecha_pago')::date, (p_fila->>'periodo')::date)
    ]
    when 'fin_saldos_iniciales' then array[(p_fila->>'fecha')::date]
    else array[(p_fila->>'periodo')::date]
  end
$$;

create or replace function fin_bloqueo_cierre() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_viejo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_nuevo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  -- Columnas que cambian sin tocar el contenido contable.
  v_ignorar text[] := array['actualizado_en', 'regla_id'];
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

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['fin_movimientos', 'fin_base_distribucion', 'fin_saldos_iniciales', 'nom_periodos', 'nom_lineas'] loop
    if to_regclass(v_tabla) is not null then
      execute format('drop trigger if exists %I on %I', v_tabla || '_cierre', v_tabla);
      execute format(
        'create trigger %I before insert or update or delete on %I for each row execute function fin_bloqueo_cierre()',
        v_tabla || '_cierre', v_tabla
      );
    end if;
  end loop;
end $$;

-- Solo el servidor (clave de servicio) llama a estas funciones.
revoke all on function fin_mes_cerrado(date) from public;
revoke all on function fin_bloqueo_cierre() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fin_mes_cerrado(date) from anon, authenticated';
    execute 'revoke all on function fin_bloqueo_cierre() from anon, authenticated';
  end if;
end $$;

comment on table fin_cierres is 'Portal AF4 360°: cierre contable de cada mes (abierto → en revisión → cerrado) con la fotografía al cerrar.';
comment on table fin_cierre_tareas is 'Portal AF4 360°: checklist de cada cierre de mes (evaluación automática y marcas a mano).';
comment on function fin_bloqueo_cierre() is 'Portal AF4 360°: rechaza cambios en las filas de un mes cerrado (fin_cierres.estado = cerrado).';

-- ---------------------------------------------------------------------------------------------
-- Permiso: lo recibe quien ya tiene «Estado de resultados», con su mismo solo lectura. Reabrir un mes exige además poder
-- modificar Usuarios y roles (se comprueba en el servidor).
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'cierre-mes', solo_lectura
from permisos_rol
where modulo = 'estado-resultados'
on conflict (rol_id, modulo) do nothing;
