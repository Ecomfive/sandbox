-- Reversa de 0247_fulfillment_quien_paga.sql: todas vuelven a pagar el fulfillment «nosotros» (su monto en Configuración no se tocó).

alter table pais_plataformas drop constraint if exists pais_plataformas_fulfillment_paga_check;
alter table pais_plataformas drop column if exists fulfillment_paga;
