-- El área de un número de WhatsApp de la empresa antes de que llegue su primer mensaje (pedido de Hernán, 31 oct 2026: el número de Alcides,
-- recién conectado en 360dialog, es el de Dirección y todos sus contactos y mensajes tienen que caer ahí). Un número entra solo al sistema con su
-- primer mensaje y hasta ahora entraba siempre en Atención: sus primeros chats los veía Atención hasta que alguien le cambiaba el área. Ahora quien
-- administra elige el área en la bandeja («Números») apenas está la clave del número en el servidor, y el número entra ya con esa área (y su
-- nombre). Solo lo lee y escribe el servidor (sin políticas). Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0210_rollback.sql

create table if not exists whatsapp_numeros_previstos (
  -- Los dígitos del número, con el código del país: «50761234567».
  digitos text primary key check (digitos ~ '^[0-9]{7,15}$'),
  area text not null check (area in ('atencion', 'comercial', 'direccion')),
  -- «Ecomfive · Dirección»; null = el de siempre («WhatsApp +507…»).
  nombre text,
  creado_en timestamptz not null default now()
);
alter table whatsapp_numeros_previstos enable row level security;

-- Un número nuevo toma el área y el nombre que se le previó.
create or replace function whatsapp_numero_previsto() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v whatsapp_numeros_previstos%rowtype;
begin
  select * into v from whatsapp_numeros_previstos where digitos = regexp_replace(coalesce(new.numero, ''), '\D', '', 'g');
  if found then
    new.area := v.area;
    if coalesce(v.nombre, '') <> '' then new.nombre := v.nombre; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists whatsapp_numero_previsto on whatsapp_numeros;
create trigger whatsapp_numero_previsto before insert on whatsapp_numeros
  for each row execute function whatsapp_numero_previsto();
