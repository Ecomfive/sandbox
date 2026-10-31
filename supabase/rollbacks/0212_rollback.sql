-- Reversa de 0212_whatsapp_numero_pais_al_entrar.sql: vuelve el disparador de la 0210 (sin país al entrar). Los países ya puestos no se quitan.

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
