-- «¿Cuánto hay?» para Proveeduría (19 nov 2026, pedido de Hernán: «Nicol quiere preguntar a despacho cuánto hay de algo y ella es de Gestión
-- Dropi»). Una pregunta puede no ser de una tienda: sin tienda (`tienda_id` null) es de Proveeduría y así sale en el panel de Yiletsi.
--   * `tienda_cuanto_hay.tienda_id` deja de ser obligatoria.
--   * Nicol (Gestión de IDs Dropi) recibe «Preguntar cuánto hay» como permiso propio (su rol, Operaciones, no lo tiene).
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0336_rollback.sql
alter table tienda_cuanto_hay alter column tienda_id drop not null;

insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'tienda-cuanto-hay', 'edicion' from perfiles where nombre ilike 'Nicol%' and activo
on conflict (perfil_id, modulo) do nothing;

notify pgrst, 'reload schema';

-- Revisión: las dos filas deben decir «sí».
select 'tienda_id opcional' as que, case when is_nullable = 'YES' then 'sí' else 'NO' end as quedo
from information_schema.columns where table_name = 'tienda_cuanto_hay' and column_name = 'tienda_id'
union all
select 'Nicol puede preguntar', case when exists (
  select 1 from permisos_persona pp join perfiles p on p.id = pp.perfil_id
  where pp.modulo = 'tienda-cuanto-hay' and p.nombre ilike 'Nicol%' and p.activo
) then 'sí' else 'NO' end;
