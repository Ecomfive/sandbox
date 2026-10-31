-- El país de un número de WhatsApp de la empresa sale solo de su prefijo también cuando el número entra con su primer mensaje (31 oct 2026,
-- pedido de Hernán: llegó el número de Costa Rica para Atención). La 0209 solo se lo puso a los que ya estaban; los que entraron después (el de
-- Dirección, el de Costa Rica) quedaban sin país y sin bandera hasta elegirlo a mano en «Números». +507 Panamá, +506 Costa Rica, +52 México; los
-- demás quedan sin país y se eligen en «Números». No pisa un país ya elegido. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0212_rollback.sql

-- El área y el nombre previstos (0210) y, si no trae país, el de su prefijo.
create or replace function whatsapp_numero_previsto() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v whatsapp_numeros_previstos%rowtype;
  d text := regexp_replace(coalesce(new.numero, ''), '\D', '', 'g');
begin
  select * into v from whatsapp_numeros_previstos where digitos = d;
  if found then
    new.area := v.area;
    if coalesce(v.nombre, '') <> '' then new.nombre := v.nombre; end if;
  end if;
  if new.pais_id is null then
    select p.id into new.pais_id from paises p
    where (p.codigo = 'PA' and d like '507%') or (p.codigo = 'CR' and d like '506%') or (p.codigo = 'MX' and d like '52%')
    limit 1;
  end if;
  return new;
end;
$$;

-- Los que entraron después de la 0209 sin país.
update whatsapp_numeros n set pais_id = p.id
from paises p
where n.pais_id is null
  and (
    (p.codigo = 'PA' and regexp_replace(n.numero, '\D', '', 'g') like '507%')
    or (p.codigo = 'CR' and regexp_replace(n.numero, '\D', '', 'g') like '506%')
    or (p.codigo = 'MX' and regexp_replace(n.numero, '\D', '', 'g') like '52%')
  );
