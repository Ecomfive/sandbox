-- CRM Dropshippers › Bandeja de WhatsApp: fotos, videos y documentos (pedido de Hernán, 28 oct 2026).
--  * Lo que manda el equipo: el navegador lo sube al bucket privado `whatsapp` (salientes/<conversación>/…), el servidor revisa su
--    contenido y lo manda por WhatsApp con un enlace firmado de una hora (WhatsApp lo baja de ahí).
--  * Lo que mandan los dropshippers: se copia al mismo bucket (entrantes/…) apenas llega, porque Meta solo lo guarda unos 30 días.
--  `media_ruta` es la ruta del archivo en el bucket; con ella la bandeja lo muestra desde el sistema y no desde Meta.
-- Reversa: supabase/rollbacks/0170_rollback.sql

alter table whatsapp_mensajes add column if not exists media_ruta text;

-- Bucket privado: solo el servidor (clave de servicio) lo lee; la bandeja da enlaces firmados de pocos minutos. WhatsApp acepta
-- documentos de hasta 100 MB.
insert into storage.buckets (id, name, public) values ('whatsapp', 'whatsapp', false)
on conflict (id) do nothing;
update storage.buckets set file_size_limit = 104857600 where id = 'whatsapp';
