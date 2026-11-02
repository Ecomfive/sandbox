-- Importar un chat exportado desde el celular (CRM › Bandeja de WhatsApp, 28 oct 2026): los mensajes van a whatsapp_mensajes con
-- wa_id «import:<huella>» (así importar dos veces el mismo chat no lo repite) y sus fotos, audios y documentos a este bucket privado,
-- uno por conversación («<conversación>/<mensaje>-<nombre>»). Se sirven por /api/whatsapp/media/<mensaje>, que revisa el área.
-- Hasta 25 MB por archivo, como los que manda WhatsApp.

insert into storage.buckets (id, name, public, file_size_limit) values ('whatsapp-importados', 'whatsapp-importados', false, 26214400)
on conflict (id) do nothing;
