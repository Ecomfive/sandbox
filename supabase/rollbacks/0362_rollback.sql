-- Reversa de 0362: se quitan los cierres, las cuentas de los repartidores (sus usuarios de acceso quedan: bórralos en Supabase › Authentication si
-- hace falta) y las columnas nuevas de Despacho ciudad. Lo que marcaron (estado, cobro, comprobantes) queda en las filas.
drop table if exists despacho_cierres;
drop table if exists despacho_repartidores;
alter table mon_despachos drop column if exists reprogramado_para;
alter table mon_despachos drop column if exists comprobante_numero;
alter table mon_despachos drop column if exists marcado_lng;
alter table mon_despachos drop column if exists marcado_lat;
alter table mon_despachos drop column if exists marcado_en;
alter table mon_despachos drop column if exists marcado_desde;
notify pgrst, 'reload schema';
