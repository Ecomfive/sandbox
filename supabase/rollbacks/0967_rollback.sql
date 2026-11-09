-- Reversa de 0967.
delete from fin_movimientos m where m.origen = 'costo_ordenes_shopify'
  and not exists (select 1 from conc_pares p where p.movimiento_id = m.id)
  and not exists (select 1 from fin_cierres f where f.periodo = m.periodo and f.estado = 'cerrado');
drop function if exists fin_costos_desde_ordenes();
