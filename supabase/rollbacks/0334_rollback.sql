-- Reversa de 0334_marcar_danado.sql: quita la función. Los movimientos que ya dejó en el libro (y las unidades marcadas como defectuosas) se quedan: el libro no se edita.
drop function if exists wms_marcar_danado(uuid, uuid, text, integer, text, uuid);
