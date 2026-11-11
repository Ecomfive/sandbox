-- Portal AF4 360° — Covenants (mejora 20). La tarea diaria «alertas» (src/lib/tareas/ejecutar.ts, `generarAlertasCovenants`)
-- deja una alerta `tesoreria_covenant` en `fin_alertas` por cada covenant activo que hoy incumple, está en riesgo o
-- incumpliría en los próximos 6 meses según la proyección (Tesorería › Covenants).
--
-- Solo suma el tipo nuevo al `check` de `fin_alertas` (misma lista que `TIPOS_ALERTA` en src/lib/tareas/alertas.ts),
-- conservando los de las migraciones 0921, 0928, 0939 y 0943. `not valid`: no revisa las filas que ya estaban. Se puede
-- correr dos veces.

do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_alertas'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table fin_alertas drop constraint %I', r.conname);
  end loop;
  alter table fin_alertas add constraint fin_alertas_tipo_check check (tipo in (
    'caja_minima', 'cxp_vence', 'cxc_vencido', 'cierre_pendiente', 'costo_ventas', 'inventario_sin_costo',
    'cierre_tarea_atrasada', 'fiscal_vence',
    'tesoreria_dropi', 'tesoreria_efectivo', 'tesoreria_depositos', 'tesoreria_linea_vencida', 'tesoreria_linea_renovar',
    'tesoreria_linea_uso', 'tesoreria_saldos', 'tesoreria_pagos',
    'pauta_techo',
    'tesoreria_covenant'
  )) not valid;
end $$;
