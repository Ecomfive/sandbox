-- CRM Dropshippers › Bandeja de WhatsApp: borrar un chat o un mensaje ya no pide autorización (pedido de Jhokser, 2 nov 2026). Se borra como en WhatsApp Business:
-- a quien tiene solo Atención el mensaje o el chat se le quita; Comercial, Dirección y los administradores lo siguen viendo, con la etiqueta de que se borró y quién lo
-- borró. No se pierde nada: la migración 0171 sigue impidiendo cualquier DELETE de verdad. Se reutilizan las marcas de 0171 (`eliminado_en_whatsapp_en`,
-- `borrada_en_app_en` / `_por`), que ya esconden lo borrado a Atención; solo se anota de dónde vino.
--   * whatsapp_mensajes.eliminado_por: quién lo borró desde el sistema (null = lo eliminó su autor en WhatsApp, o el equipo desde la app del celular).
--   * whatsapp_conversaciones.borrada_desde_sistema: el chat se borró desde el sistema (false = lo marcó una persona porque se borró en la app del celular).
-- Lo que ya estaba oculto para todos (0172) y las peticiones que esperaban autorización pasan al modelo nuevo.
-- Reversa: supabase/rollbacks/0219_rollback.sql

alter table whatsapp_mensajes add column if not exists eliminado_por text;
alter table whatsapp_conversaciones add column if not exists borrada_desde_sistema boolean not null default false;

-- Las peticiones pendientes se aplican como borrado directo y se cierran.
update whatsapp_mensajes m
   set eliminado_en_whatsapp_en = coalesce(m.eliminado_en_whatsapp_en, now()),
       eliminado_por = coalesce(m.eliminado_por, s.solicitante_nombre)
  from whatsapp_solicitudes_borrado s
 where s.estado = 'pendiente' and s.tipo = 'mensaje' and s.mensaje_id = m.id;

update whatsapp_conversaciones c
   set borrada_en_app_en = coalesce(c.borrada_en_app_en, now()),
       borrada_en_app_por = coalesce(c.borrada_en_app_por, s.solicitante_nombre),
       borrada_desde_sistema = true
  from whatsapp_solicitudes_borrado s
 where s.estado = 'pendiente' and s.tipo = 'chat' and s.conversacion_id = c.id;

update whatsapp_solicitudes_borrado
   set estado = 'cancelada', resuelta_en = now(), nota_resolucion = 'Pasó a borrado directo (migración 0219)'
 where estado = 'pendiente';

-- Lo que estaba oculto para todos pasa a borrado (quien lo borró es quien lo había pedido): ahora lo ven Comercial, Dirección y los administradores, con su etiqueta.
update whatsapp_mensajes
   set eliminado_en_whatsapp_en = coalesce(eliminado_en_whatsapp_en, oculto_en),
       eliminado_por = coalesce(eliminado_por, regexp_replace(oculto_por, '^.* autorizó; lo pidió ', ''), 'Sistema'),
       oculto_en = null, oculto_por = null
 where oculto_en is not null;

update whatsapp_conversaciones
   set borrada_en_app_en = coalesce(borrada_en_app_en, oculta_en),
       borrada_en_app_por = coalesce(borrada_en_app_por, regexp_replace(oculta_por, '^.* autorizó; lo pidió ', ''), 'Sistema'),
       borrada_desde_sistema = true,
       oculta_en = null, oculta_por = null
 where oculta_en is not null;
