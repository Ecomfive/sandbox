-- Reversa de 0295_despacho_y_forma_de_pago.sql: quita la forma de pago al recibir y las columnas de Monday (los cursores no se tocan).
alter table mon_despachos drop column if exists monto_cobrado;
alter table mon_despachos drop column if exists forma_pago;
alter table ven_ordenes drop constraint if exists ven_ordenes_forma_pago_entrega_check;
alter table ven_ordenes drop column if exists forma_pago_entrega;
notify pgrst, 'reload schema';
