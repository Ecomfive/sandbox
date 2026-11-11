-- Portal AF4 360°: valoración configurable (Panel financiero › Valoración) y presupuesto por tipo de gasto.
--
-- 1. Valoración: los supuestos viven en `fin_config` (migración 0917), clave `valoracion`:
--    { multiplo, tasa_descuento, crecimiento_perpetuo, años, tasa_impuesto } (tasas en %). Se siembra la fila con los
--    valores por defecto de `src/lib/finanzas/valoracion.ts`; si ya existe no se toca. Sin la 0130 no hace nada y el
--    código usa los valores por defecto.
-- 2. Presupuesto por tipo: `fin_presupuesto_lineas.tipo_id` ya existe (0126) y su llave única ya incluye el tipo. Un
--    presupuesto nuevo guarda una línea por tipo de gasto (tipo null = «Otros de <sección>»); uno viejo, sin tipos,
--    sigue igual. Se agrega un índice para leer las líneas de una sección y se exige que el tipo sea de esa sección.
--
-- RLS: sin tablas nuevas. Se puede correr dos veces.

do $$
begin
  if to_regclass('public.fin_config') is not null then
    insert into fin_config (clave, valor)
    values ('valoracion', '{"multiplo": 4, "tasa_descuento": 22, "crecimiento_perpetuo": 3, "años": 5, "tasa_impuesto": 25}'::jsonb)
    on conflict (clave) do nothing;
  end if;
end $$;

create index if not exists fin_presupuesto_lineas_seccion on fin_presupuesto_lineas (presupuesto_id, escenario, seccion, unidad_id);

-- El tipo de una línea tiene que ser de la misma sección (lo comprueba también la acción que edita).
create or replace function fin_presupuesto_tipo_de_seccion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tipo_id is not null and not exists (select 1 from fin_tipos t where t.id = new.tipo_id and t.seccion = new.seccion) then
    raise exception 'El tipo no es de la sección %', new.seccion using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists fin_presupuesto_tipo_de_seccion on fin_presupuesto_lineas;
create trigger fin_presupuesto_tipo_de_seccion
  before insert or update of tipo_id, seccion on fin_presupuesto_lineas
  for each row execute function fin_presupuesto_tipo_de_seccion();

revoke all on function fin_presupuesto_tipo_de_seccion() from public;

comment on column fin_presupuesto_lineas.tipo_id is 'Portal AF4 360°: tipo de gasto de la línea; null = «Otros de <sección>» (o la sección entera en un presupuesto sin detalle por tipo).';
