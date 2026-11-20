-- Reversa de 0986. Los tipos de redondeo solo se borran si ningún movimiento los usa.
delete from fin_config where clave in ('conc_tolerancia_centavos', 'conc_dias_alerta');
delete from fin_tipos t
where t.nombre in ('Redondeo bancario a favor', 'Redondeo bancario en contra')
  and not exists (select 1 from fin_movimientos m where m.tipo_id = t.id)
  and not exists (select 1 from fin_reglas r where r.tipo_id = t.id);
alter table fin_reglas drop column if exists conciliar_auto;
drop table if exists fin_reparto_plantillas;
alter table fin_movimientos drop column if exists nota_interna;
-- La alerta nueva: se borran sus filas y vuelve el check de 0983.
delete from fin_alertas where tipo = 'conciliacion_atrasada';
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
    'pauta_techo', 'tesoreria_covenant', 'riesgo_sube', 'presupuesto_desvio', 'gasto_anomalo', 'prestamo_grupo_vence'
  )) not valid;
end $$;
