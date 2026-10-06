-- Variantes de un producto (decisión de Hernán, 7 oct 2026): un producto puede tener variantes (Color: Beige, Negro; Talla:
-- S, M, L). Cada combinación es un producto simple propio —su SKU, su stock, su código de barras y sus lotes— que cuelga del
-- producto padre (`padre_id`) con sus valores (`opciones`, p. ej. {"Color": "Beige", "Talla": "S"}). El padre guarda qué
-- opciones tiene y sus valores (`opciones_variantes`, p. ej. [{"nombre": "Color", "valores": ["Beige", "Negro"]}]) y ya no
-- tiene stock propio: el inventario se lleva en cada variante. En Compras, al elegir un producto con variantes se pide la
-- cantidad de cada una.
--
-- Reglas (también en el servidor, con mensajes claros): una variante es simple y su padre es un producto simple que no es a
-- su vez variante (un solo nivel); un compuesto no tiene variantes; un producto con variantes no registra movimientos de
-- inventario.

alter table skus_maestros
  add column if not exists padre_id uuid references skus_maestros(id),
  add column if not exists opciones jsonb,
  add column if not exists opciones_variantes jsonb;
alter table skus_maestros drop constraint if exists skus_maestros_padre_distinto;
alter table skus_maestros add constraint skus_maestros_padre_distinto check (padre_id is null or padre_id <> id);
alter table skus_maestros drop constraint if exists skus_maestros_variante_simple;
alter table skus_maestros add constraint skus_maestros_variante_simple check (padre_id is null or tipo = 'simple');
create index if not exists skus_maestros_padre on skus_maestros (padre_id) where padre_id is not null;

-- Un solo nivel: el padre de una variante no puede ser variante, ni compuesto.
create or replace function skus_maestros_variante_guardia() returns trigger language plpgsql as $$
begin
  if new.padre_id is not null and exists (select 1 from skus_maestros where id = new.padre_id and (padre_id is not null or tipo <> 'simple')) then
    raise exception 'El producto padre debe ser simple y no puede ser a su vez una variante.';
  end if;
  return new;
end;
$$;
drop trigger if exists skus_maestros_variante on skus_maestros;
create trigger skus_maestros_variante before insert or update of padre_id on skus_maestros
  for each row execute function skus_maestros_variante_guardia();

-- Un producto con variantes no mueve inventario: se mueve cada variante.
create or replace function wms_movimientos_sin_padre() returns trigger language plpgsql as $$
begin
  if exists (select 1 from skus_maestros where padre_id = new.sku_maestro_id) then
    raise exception 'Este producto tiene variantes: el inventario se mueve en cada variante.';
  end if;
  return new;
end;
$$;
drop trigger if exists wms_movimientos_padre on wms_movimientos;
create trigger wms_movimientos_padre before insert on wms_movimientos
  for each row execute function wms_movimientos_sin_padre();
