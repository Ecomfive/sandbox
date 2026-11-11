delete from fin_movimientos m where m.origen = 'ordenes_shopify'
  and not exists (select 1 from conc_pares p where p.movimiento_id = m.id)
  and not exists (select 1 from fin_cierres f where f.periodo = m.periodo and f.estado = 'cerrado');
drop function if exists fin_ingresos_desde_ordenes();
