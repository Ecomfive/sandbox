-- Reversa de la 0272: quita las funciones para unir dropshippers. Lo que ya se unió no se puede separar.
drop function if exists crm_unir_dropshippers(uuid, uuid, text, boolean);
drop function if exists _crm_unir_dropshippers(uuid, uuid, text);
