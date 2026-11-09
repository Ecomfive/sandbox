-- Una variante sin foto propia usa la de su producto principal (9 nov 2026, pedido de Hernán: las variantes que se crearon para la tienda
-- salían sin foto). La foto de la variante se guarda como la misma dirección que la del principal y se mantiene sola:
--   * al crear una variante (o al quitarle la foto) sin foto propia, toma la del principal;
--   * si cambia la foto del principal, las variantes que usaban la anterior (o no tenían) pasan a la nueva; las que tienen la suya, no.
-- La foto propia de una variante manda siempre. El código nunca borra del almacén un archivo que otro producto sigue usando.
-- Reversa: supabase/rollbacks/0258_rollback.sql

create or replace function skus_maestros_foto_heredada() returns trigger language plpgsql as $$
begin
  if new.padre_id is not null and new.foto_url is null then
    select p.foto_url, p.foto_huella into new.foto_url, new.foto_huella from skus_maestros p where p.id = new.padre_id;
  end if;
  return new;
end $$;

drop trigger if exists skus_maestros_foto_heredada on skus_maestros;
create trigger skus_maestros_foto_heredada before insert or update on skus_maestros
  for each row execute function skus_maestros_foto_heredada();

create or replace function skus_maestros_foto_a_variantes() returns trigger language plpgsql as $$
begin
  update skus_maestros h
     set foto_url = new.foto_url, foto_huella = new.foto_huella
   where h.padre_id = new.id
     and (h.foto_url is null or h.foto_url = old.foto_url or h.foto_url = new.foto_url);
  return null;
end $$;

drop trigger if exists skus_maestros_foto_a_variantes on skus_maestros;
create trigger skus_maestros_foto_a_variantes after update of foto_url, foto_huella on skus_maestros
  for each row when (new.padre_id is null) execute function skus_maestros_foto_a_variantes();

-- Las variantes que ya existen sin foto toman la de su principal.
update skus_maestros h
   set foto_url = p.foto_url, foto_huella = p.foto_huella
  from skus_maestros p
 where h.padre_id = p.id and h.foto_url is null and p.foto_url is not null;
