-- Reversa de 0987. La vista no se puede volver a sus columnas de antes sin borrar las que dependen de ella: queda con las
-- columnas nuevas, pero sin `costo_metodo` vuelve a usar el último lote (lo de antes). Se quitan los lotes que trajo Compras.
delete from fin_config where clave = 'costo_metodo';
delete from fin_costos_lotes where origen = 'compras';
delete from fin_alertas where tipo = 'costo_sube';
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
    'conciliacion_atrasada'
  )) not valid;
end $$;
