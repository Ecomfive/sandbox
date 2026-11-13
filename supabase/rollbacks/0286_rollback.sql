-- Reversa de 0286: quita el disparador que apaga solo la marca «sin repartir». Las marcas que ya se quitaron no se vuelven a poner.
drop trigger if exists wms_stock_quitar_reparto_pendiente on wms_stock;
drop function if exists wms_quitar_reparto_pendiente_en_cero();
