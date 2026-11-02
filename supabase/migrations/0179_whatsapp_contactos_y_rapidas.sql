-- CRM Dropshippers › Bandeja de WhatsApp: nombre editable de cada contacto y mensajes rápidos del equipo (pedido de Jhokser, 29 oct 2026).
--   * `whatsapp_conversaciones.nombre_personalizado`: el nombre que el equipo le pone a un chat. Manda sobre el del CRM y el del perfil de WhatsApp (que se vuelve a escribir con cada
--     mensaje, por eso no se puede editar ese mismo campo). Vacío = el nombre de siempre.
--   * `whatsapp_respuestas_rapidas`: los mensajes rápidos, compartidos por todo el equipo del CRM. Se agregan desde un mensaje escrito (o uno ya mandado), se sugieren mientras se escribe
--     y se ordenan por uso. Nada de WhatsApp se borra con esto: los mensajes rápidos son plantillas de texto del equipo, no historial.
-- Código: src/app/(app)/crm-dropshippers/bandeja/rapidas-actions.ts. Reversa: supabase/rollbacks/0179_rollback.sql

alter table whatsapp_conversaciones add column if not exists nombre_personalizado text;

create table if not exists whatsapp_respuestas_rapidas (
  id uuid primary key default uuid_v7(),
  texto text not null check (length(btrim(texto)) between 2 and 1000),
  usos integer not null default 0,
  creada_por text,
  creado_en timestamptz not null default now()
);
-- Una respuesta no se repite (sin importar mayúsculas ni espacios de más).
create unique index if not exists whatsapp_respuestas_rapidas_texto_unico on whatsapp_respuestas_rapidas (lower(btrim(texto)));

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table whatsapp_respuestas_rapidas enable row level security;

-- Las de siempre y un saludo para empezar; el equipo agrega y quita las suyas.
insert into whatsapp_respuestas_rapidas (texto, creada_por) values
  ('Hola, ¿cómo estás? 👋', 'Sistema'),
  ('¡Hola! ¿En qué te puedo ayudar?', 'Sistema'),
  ('Ya reviso tu guía y te confirmo 👌', 'Sistema'),
  ('¿Me compartes el número de pedido?', 'Sistema'),
  ('Te paso el estado en un momento', 'Sistema'),
  ('Gracias por escribirnos 🙌', 'Sistema')
on conflict do nothing;
