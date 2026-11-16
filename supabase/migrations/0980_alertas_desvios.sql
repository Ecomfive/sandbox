-- Portal AF4 360°: alertas de desvío contra el presupuesto y de gastos fuera de lo normal (src/lib/finanzas/desvios.ts).
-- Solo agrega dos tipos al check de fin_alertas; no toca datos. Se puede correr más de una vez.
-- Numeración: 0970–0972 ya las usó el equipo de Ecomfive; el portal sigue desde 0980.
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
    'tesoreria_covenant',
    'riesgo_sube',
    'presupuesto_desvio',
    'gasto_anomalo'
  )) not valid;
end $$;
