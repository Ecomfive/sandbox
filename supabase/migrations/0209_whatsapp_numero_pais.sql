-- El país de cada número de WhatsApp de la empresa (pedido de Hernán, 31 oct 2026): Atención va a contestar desde varios números (Panamá, Costa Rica,
-- México) y todos sus chats salen en el mismo lugar; cada chat lleva la bandera del país del número por el que entró y la bandeja filtra por país.
-- Se toma del prefijo cuando corresponde a un país de la operación (+507 Panamá, +506 Costa Rica, +52 México); los demás quedan sin país y un
-- administrador lo elige en la bandeja («Números»). Se puede correr de nuevo sin efecto (no pisa uno ya elegido).
-- Reversa: supabase/rollbacks/0209_rollback.sql

alter table whatsapp_numeros add column if not exists pais_id uuid references paises(id) on delete set null;

update whatsapp_numeros n set pais_id = p.id
from paises p
where n.pais_id is null
  and (
    (p.codigo = 'PA' and regexp_replace(n.numero, '\D', '', 'g') like '507%')
    or (p.codigo = 'CR' and regexp_replace(n.numero, '\D', '', 'g') like '506%')
    or (p.codigo = 'MX' and regexp_replace(n.numero, '\D', '', 'g') like '52%')
  );
