-- 0969 · Cuánto tarda cada página para quien la usa (mejora 32).
--
-- `app_metricas`: lo que manda el navegador con `useReportWebVitals` de Next (TTFB, FCP, LCP, INP, CLS) por ruta (los ids se
-- reemplazan por «:id» antes de mandar). Sin persona: solo la ruta, la métrica y el valor. Se guarda 30 días.
-- `app_metricas_resumen(p_dias)`: por ruta y métrica, cuántas mediciones, mediana, p75 y p95.
-- RLS activado y sin políticas: solo el servidor escribe y lee. Se puede correr dos veces.

create table if not exists app_metricas (
  id bigint generated always as identity primary key,
  ruta text not null check (length(ruta) between 1 and 200),
  metrica text not null check (metrica in ('TTFB', 'FCP', 'LCP', 'INP', 'CLS')),
  valor numeric(12, 4) not null check (valor >= 0),
  creado_en timestamptz not null default now()
);
alter table app_metricas enable row level security;
create index if not exists app_metricas_creado_idx on app_metricas (creado_en);

create or replace function app_metricas_resumen(p_dias integer default 7)
returns table (ruta text, metrica text, n bigint, p50 numeric, p75 numeric, p95 numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select m.ruta, m.metrica, count(*)::bigint,
         round(percentile_cont(0.5) within group (order by m.valor)::numeric, 2),
         round(percentile_cont(0.75) within group (order by m.valor)::numeric, 2),
         round(percentile_cont(0.95) within group (order by m.valor)::numeric, 2)
  from app_metricas m
  where m.creado_en >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 30)))
  group by m.ruta, m.metrica;
$$;
revoke all on function app_metricas_resumen(integer) from public, anon, authenticated;
comment on table app_metricas is 'Portal AF4 360°: Web Vitals por ruta (mejora 32), 30 días.';
