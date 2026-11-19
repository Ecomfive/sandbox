-- Reversa de 0989. Los movimientos que creó el portal (origen 'sistema') se borran; los aportes vuelven a ser deuda.
delete from fin_alertas where tipo = 'caja_minima_empresa';
delete from fin_config where clave = 'caja_minima_empresas';
drop table if exists fin_grupo_confirmaciones;
drop table if exists fin_grupo_pares;
delete from fin_grupo_movimientos where origen = 'sistema';
do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_grupo_movimientos'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%origen%'
  loop
    execute format('alter table fin_grupo_movimientos drop constraint %I', r.conname);
  end loop;
  alter table fin_grupo_movimientos add constraint fin_grupo_movimientos_origen_check check (origen in ('manual', 'clickup', 'libro'));
end $$;
alter table fin_grupo_movimientos drop column if exists soporte;
alter table fin_grupo_movimientos drop column if exists naturaleza;
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
    'pauta_techo', 'tesoreria_covenant', 'riesgo_sube', 'presupuesto_desvio', 'gasto_anomalo', 'prestamo_grupo_vence',
    'conciliacion_atrasada', 'costo_sube'
  )) not valid;
end $$;
