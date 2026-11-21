-- Anuncios Meta (20 nov 2026, pedido de Jhokser): saber con certeza qué fechas de cada cuenta ya se trajeron de Meta. «Traer historial» podía colgarse con un mes grande y no había forma de comprobar, en las otras cuentas,
-- si el historial había llegado completo. Cada lectura que llega entera deja aquí su rango de fechas (`meta_lecturas_tramos`); la función `meta_cobertura` junta esos rangos y los días que tienen resultados para que la
-- pantalla de Cuentas muestre un cuadro por mes. Solo las usa el servidor (service_role). Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0346_rollback.sql

create table if not exists meta_lecturas_tramos (
  id uuid primary key default uuid_v7(),
  cuenta_id uuid not null references meta_cuentas(id) on delete cascade,
  desde date not null,
  hasta date not null,
  filas integer not null default 0,
  leido_en timestamptz not null default now(),
  check (desde <= hasta)
);
create index if not exists meta_lecturas_tramos_cuenta on meta_lecturas_tramos (cuenta_id, desde, hasta);
alter table meta_lecturas_tramos enable row level security;

-- Los rangos leídos completos y los días con resultados de una cuenta, en un solo jsonb (una sola fila: el límite de 1000 filas de PostgREST no aplica).
create or replace function meta_cobertura(p_cuenta uuid, p_desde date, p_hasta date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'tramos', coalesce((select jsonb_agg(jsonb_build_array(to_char(t.desde, 'YYYY-MM-DD'), to_char(t.hasta, 'YYYY-MM-DD')) order by t.desde)
                          from meta_lecturas_tramos t
                         where t.cuenta_id = p_cuenta and t.hasta >= p_desde and t.desde <= p_hasta), '[]'::jsonb),
    'dias', coalesce((select jsonb_agg(to_char(d.fecha, 'YYYY-MM-DD') order by d.fecha)
                        from (select distinct r.fecha from meta_resultados_dia r where r.cuenta_id = p_cuenta and r.fecha between p_desde and p_hasta) d), '[]'::jsonb)
  )
$$;

notify pgrst, 'reload schema';
