-- Reversa de 0966.
delete from fin_movimientos m where m.origen = 'fulfillment'
  and not exists (select 1 from conc_pares p where p.movimiento_id = m.id)
  and not exists (select 1 from fin_cierres f where f.periodo = m.periodo and f.estado = 'cerrado');
delete from fin_cartera d where d.origen = 'fulfillment' and not exists (select 1 from fin_cartera_abonos a where a.documento_id = d.id);
drop function if exists fin_sincronizar_fulfillment();
alter table fin_cartera drop constraint if exists fin_cartera_origen_check;
alter table fin_cartera add constraint fin_cartera_origen_check check (origen in ('manual', 'excel', 'dropi', 'tiendas', 'fulfillment'));
alter table fin_unidades drop column if exists tarifa_fulfillment;
