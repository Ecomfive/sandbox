-- Portal AF4 360° — Techo de pauta por tienda (mejora 6). La tarea diaria «alertas» (src/lib/tareas/ejecutar.ts,
-- `generarAlertasPauta`) deja una alerta `pauta_techo` en `fin_alertas` cuando una tienda propia gasta en pauta más que su
-- techo (22 % de las ventas por defecto; se cambia en Panel financiero › Comité) en el mes en curso (proyectado a fin de
-- mes) o en el último mes cerrado. El monto de la alerta es la pauta excedente del mes (cuánto vale bajar al techo).
--
-- Esta migración solo suma el tipo nuevo al `check` de `fin_alertas` (misma lista que `TIPOS_ALERTA` en
-- src/lib/tareas/alertas.ts), conservando los tipos de las migraciones 0921, 0928 y 0939. `not valid`: no revisa las filas
-- que ya estaban (todas cumplen; así no se bloquea la tabla). Se puede correr dos veces.

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
    'pauta_techo'
  )) not valid;
end $$;
