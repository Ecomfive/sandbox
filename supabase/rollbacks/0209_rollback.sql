-- Reversa de 0209_whatsapp_numero_pais.sql: quita el país de los números de WhatsApp (los chats dejan de llevar la bandera del número).

alter table whatsapp_numeros drop column if exists pais_id;
