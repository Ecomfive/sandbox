-- CRM Dropshippers › Bandeja de WhatsApp: los chats no se borran (pedido de Jhokser, 28 oct 2026). Aunque alguien borre una conversación en la app de
-- WhatsApp Business (coexistencia), en el sistema se queda todo. Lo único que se puede hacer es dejar una nota o poner la marca «borrado en la app de
-- WhatsApp Business».
--   * Dos disparadores hacen fallar cualquier DELETE o TRUNCATE sobre `whatsapp_conversaciones` y `whatsapp_mensajes`, venga de la app, de un script o
--     del editor SQL (el borrado en cascada de una conversación también pasa por el disparador de sus mensajes). Mismo patrón que la migración 0140.
--   * `whatsapp_conversaciones.borrada_en_app_en` / `_por`: la marca de «borrado en la app» y quién la puso. Meta no avisa cuando se borra un chat entero
--     en la app: la pone una persona desde el chat.
--   * `whatsapp_mensajes.eliminado_en_whatsapp_en`: un mensaje que su autor borró «para todos» en WhatsApp (sí hay aviso: `revoke`). El texto original se
--     conserva y el chat lo muestra con esa marca.
-- Reversa: supabase/rollbacks/0171_rollback.sql

alter table whatsapp_conversaciones add column if not exists borrada_en_app_en timestamptz;
alter table whatsapp_conversaciones add column if not exists borrada_en_app_por text;
alter table whatsapp_mensajes add column if not exists eliminado_en_whatsapp_en timestamptz;

create or replace function whatsapp_no_borrar() returns trigger
language plpgsql as $$
begin
  raise exception 'Los chats de WhatsApp no se eliminan: si se borró en la app de WhatsApp Business, márcalo en el chat.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists whatsapp_mensajes_no_borrar on whatsapp_mensajes;
create trigger whatsapp_mensajes_no_borrar
  before delete on whatsapp_mensajes
  for each row execute function whatsapp_no_borrar();

drop trigger if exists whatsapp_conversaciones_no_borrar on whatsapp_conversaciones;
create trigger whatsapp_conversaciones_no_borrar
  before delete on whatsapp_conversaciones
  for each row execute function whatsapp_no_borrar();

-- TRUNCATE no pasa por los disparadores de fila: se cierra aparte.
drop trigger if exists whatsapp_mensajes_no_vaciar on whatsapp_mensajes;
create trigger whatsapp_mensajes_no_vaciar
  before truncate on whatsapp_mensajes
  for each statement execute function whatsapp_no_borrar();

drop trigger if exists whatsapp_conversaciones_no_vaciar on whatsapp_conversaciones;
create trigger whatsapp_conversaciones_no_vaciar
  before truncate on whatsapp_conversaciones
  for each statement execute function whatsapp_no_borrar();
