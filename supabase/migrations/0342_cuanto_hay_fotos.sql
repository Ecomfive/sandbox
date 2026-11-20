-- «Pedir fotos reales» en Comunicación despacho › Cuánto hay (20 nov 2026, pedido de Nicole, de Gestión de IDs Dropi, vía Hernán): además de preguntar cuánto hay de un producto,
-- se puede pedir a despacho que le tome fotos reales. Es el mismo recorrido de «Cuánto hay»: la persona pide, a Yiletsi le llega el aviso, sube las fotos y a quien pidió le llega el aviso con las fotos.
-- Las fotos las ve solo quien las pidió y despacho; no se guardan en las notas del producto.
--   * `tienda_cuanto_hay.tipo`: 'cantidad' (lo de siempre) o 'fotos'. `pais_id`: el país de la barra de quien pide (Panamá o Costa Rica), para que despacho sepa de cuál es.
--   * `tienda_cuanto_hay_fotos`: una fila por foto subida (ruta en el almacén privado `cuanto-hay-fotos`, quién y cuándo).
--   * Quien trabaja Gestión de IDs (Dropi, Drop, Effi o Dunamixfy, con edición) recibe «Preguntar cuánto hay» (que ahora incluye pedir fotos) por su rol o como permiso propio.
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0342_rollback.sql
alter table tienda_cuanto_hay add column if not exists tipo text not null default 'cantidad';
alter table tienda_cuanto_hay drop constraint if exists tienda_cuanto_hay_tipo_check;
alter table tienda_cuanto_hay add constraint tienda_cuanto_hay_tipo_check check (tipo in ('cantidad', 'fotos'));
alter table tienda_cuanto_hay add column if not exists pais_id uuid references paises (id);

create table if not exists tienda_cuanto_hay_fotos (
  id uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references tienda_cuanto_hay (id) on delete cascade,
  ruta text not null unique check (length(ruta) <= 300),
  subido_por uuid not null,
  subido_por_nombre text,
  subido_en timestamptz not null default now()
);
create index if not exists tienda_cuanto_hay_fotos_pregunta_idx on tienda_cuanto_hay_fotos (pregunta_id, subido_en);
-- Solo el servidor (clave de servicio) la lee y la escribe.
alter table tienda_cuanto_hay_fotos enable row level security;

-- Almacén privado: se ve con enlaces firmados de una hora.
insert into storage.buckets (id, name, public, file_size_limit)
values ('cuanto-hay-fotos', 'cuanto-hay-fotos', false, 15728640)
on conflict (id) do nothing;

-- Quienes trabajan Gestión de IDs pueden pedir (y preguntar cuánto hay), por su rol…
insert into permisos_rol (rol_id, modulo, solo_lectura)
select distinct rol_id, 'tienda-cuanto-hay', false from permisos_rol
where modulo in ('publicaciones-dropi', 'publicaciones-drop', 'publicaciones-effi', 'publicaciones-dunamixfy') and solo_lectura = false
on conflict (rol_id, modulo) do nothing;
-- …o como permiso propio.
insert into permisos_persona (perfil_id, modulo, nivel)
select distinct pp.perfil_id, 'tienda-cuanto-hay', 'edicion' from permisos_persona pp join perfiles p on p.id = pp.perfil_id
where pp.modulo in ('publicaciones-dropi', 'publicaciones-drop', 'publicaciones-effi', 'publicaciones-dunamixfy') and pp.nivel = 'edicion' and p.activo
on conflict (perfil_id, modulo) do nothing;

notify pgrst, 'reload schema';

-- Revisión: las tres filas deben decir «sí».
select 'tipo y país en las preguntas' as que, case when (select count(*) from information_schema.columns where table_name = 'tienda_cuanto_hay' and column_name in ('tipo', 'pais_id')) = 2 then 'sí' else 'NO' end as quedo
union all
select 'tabla de fotos', case when to_regclass('public.tienda_cuanto_hay_fotos') is not null then 'sí' else 'NO' end
union all
select 'almacén de fotos', case when exists (select 1 from storage.buckets where id = 'cuanto-hay-fotos') then 'sí' else 'NO' end;
