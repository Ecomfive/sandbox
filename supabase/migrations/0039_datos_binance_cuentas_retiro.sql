-- Las cuentas destino de tipo Binance guardan sus datos en el mismo formato que pide Dropi al
-- registrar la cuenta: pais, banco (la red, p. ej. USDT(RED=TRC-20)), tipo_identificacion,
-- numero_identificacion, tipo_cuenta y numero_cuenta (la direccion de la billetera). Es un solo
-- objeto json; `detalle` sigue guardando el numero de cuenta para que las listas lo muestren igual.
--
-- Si esta migracion todavia no se corrio, las cuentas que no son Binance siguen funcionando igual;
-- crear o modificar una cuenta Binance avisa que falta correrla.

alter table cuentas_retiro add column if not exists datos_binance jsonb;
