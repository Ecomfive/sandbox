-- Reversa de 0219 (borrar sin autorización): lo que se borró desde el sistema vuelve a quedar oculto para todos, como en 0172. Las peticiones que pasaron a
-- borrado directo quedan canceladas (no se reabren).
update whatsapp_mensajes
   set oculto_en = eliminado_en_whatsapp_en, oculto_por = eliminado_por, eliminado_en_whatsapp_en = null
 where eliminado_por is not null;

update whatsapp_conversaciones
   set oculta_en = borrada_en_app_en, oculta_por = borrada_en_app_por, borrada_en_app_en = null, borrada_en_app_por = null
 where borrada_desde_sistema;

alter table whatsapp_mensajes drop column if exists eliminado_por;
alter table whatsapp_conversaciones drop column if exists borrada_desde_sistema;
