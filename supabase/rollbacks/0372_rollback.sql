-- Reversa de 0372_transferir_danado.sql.
drop function if exists wms_transferir_danado(uuid, uuid, uuid, integer, text, uuid);
notify pgrst, 'reload schema';
