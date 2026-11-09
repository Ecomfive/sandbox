delete from fin_cartera where origen = 'tiendas' and not exists (select 1 from fin_cartera_abonos a where a.documento_id = fin_cartera.id);
drop function if exists fin_sincronizar_tiendas();
drop table if exists fin_tiendas_mensual;
alter table fin_cartera drop constraint if exists fin_cartera_origen_check;
alter table fin_cartera add constraint fin_cartera_origen_check check (origen in ('manual', 'excel', 'dropi'));
