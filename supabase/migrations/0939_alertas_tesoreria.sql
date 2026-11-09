-- Portal AF4 360°: las alertas de Tesorería (wallet de Dropi, efectivo viejo en repartidores, depósitos faltantes,
-- líneas de crédito, saldos bancarios desactualizados y pagos por aprobar) pasan a `fin_alertas`. Las deja la tarea
-- diaria «alertas» (`generarAlertasTesoreria`, src/lib/tareas/ejecutar.ts) en vez de calcularse cada vez que se abre la
-- página; así salen también en «Necesita tu atención» del Panel y se pueden dar por vistas. Esta migración solo suma los
-- tipos nuevos al `check` de `fin_alertas` (misma lista que `TIPOS_ALERTA` en src/lib/tareas/alertas.ts).
--
-- Se puede correr dos veces.

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
    'tesoreria_linea_uso', 'tesoreria_saldos', 'tesoreria_pagos'
  )) not valid;
end $$;
