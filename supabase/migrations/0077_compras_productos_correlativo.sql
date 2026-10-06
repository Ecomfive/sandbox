-- Compras: código automático por país y los productos de cada orden de compra.
--
-- * wms_compras_correlativo: el prefijo y el último número de las órdenes de compra de cada país (`clave` = código del
--   país) y de Importadora (`clave` = 'importacion'). Se sigue con la numeración que traían de ClickUp: Panamá ECOM01,
--   México ECOM02, Costa Rica ECOM03, Venezuela ECOM04, Importadora ECOM07. Guatemala, Nicaragua, El Salvador y Honduras
--   no tenían: se configuran en Configuración › Países y, mientras tanto, sus compras se crean sin código.
-- * wms_siguiente_codigo_compra(clave): reserva el número siguiente («ECOM01-0450») de una vez, aunque se creen dos compras
--   al mismo tiempo. Sin prefijo configurado devuelve null.
-- * wms_compra_items: los productos de una orden de compra (de la ficha de producto), con lo pedido y su costo, y lo
--   recibido con su fecha. `lote_numero` es el lote del producto EN EL PAÍS de la compra: Lote #1, #2… se numera por país
--   (decisión de Hernán, 7 oct 2026). Las compras traídas de ClickUp se enlazan a mano (origen 'clickup') con el número de
--   lote que decía su nombre; las nuevas toman el siguiente.
-- * Los códigos de Panamá pasan de «ECOM-0241» a «ECOM01-0241» y el «COM02-0076» de México (mal escrito) a «ECOM02-0076»;
--   los del formato viejo (PA-00191, VE-00017, MX-00020) quedan como están. El código, que antes solo estaba en el nombre,
--   se copia a la columna `codigo`.
-- Las tablas nuevas llevan RLS y ninguna política: solo el servidor las toca (ver migración 0063 y SEGURIDAD.md).

create table if not exists wms_compras_correlativo (
  clave text primary key,
  prefijo text check (prefijo is null or prefijo ~ '^[A-Z0-9]{2,12}$'),
  ultimo integer not null default 0 check (ultimo >= 0),
  actualizado_en timestamptz not null default now()
);
alter table wms_compras_correlativo enable row level security;

insert into wms_compras_correlativo (clave, prefijo, ultimo) values
  ('PA', 'ECOM01', 449),
  ('MX', 'ECOM02', 78),
  ('CR', 'ECOM03', 218),
  ('VE', 'ECOM04', 19),
  ('importacion', 'ECOM07', 2)
on conflict (clave) do nothing;

create or replace function wms_siguiente_codigo_compra(p_clave text) returns text
language sql as $$
  update wms_compras_correlativo
     set ultimo = ultimo + 1, actualizado_en = now()
   where clave = p_clave and prefijo is not null
  returning prefijo || '-' || lpad(ultimo::text, 4, '0')
$$;

create table if not exists wms_compra_items (
  id uuid primary key default uuid_v7(),
  compra_id uuid not null references wms_compras(id) on delete cascade,
  sku_maestro_id uuid not null references skus_maestros(id),
  cantidad_pedida integer not null check (cantidad_pedida > 0),
  costo_unitario numeric(14, 4) check (costo_unitario is null or costo_unitario >= 0),
  lote_numero integer not null check (lote_numero > 0),
  cantidad_recibida integer check (cantidad_recibida is null or cantidad_recibida >= 0),
  fecha_recepcion date,
  bodega_id uuid references wms_bodegas(id),
  notas text,
  origen text not null default 'sistema' check (origen in ('sistema', 'clickup')),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (compra_id, sku_maestro_id)
);
create index if not exists wms_compra_items_sku on wms_compra_items (sku_maestro_id);
alter table wms_compra_items enable row level security;

-- Agrega un producto a una compra con el número de lote siguiente de ese producto en el país de la compra (o el que se
-- indique, para el historial de ClickUp). Bloquea las compras del producto en ese país mientras numera, así dos compras a la
-- vez no toman el mismo número. Solo compras de país: Importadora compra para clientes, no para nuestro inventario.
create or replace function wms_agregar_item_compra(
  p_compra uuid, p_sku uuid, p_cantidad integer, p_costo numeric, p_lote integer, p_origen text, p_usuario uuid
) returns uuid
language plpgsql as $$
declare
  v_pais uuid;
  v_lote integer;
  v_id uuid;
begin
  select pais_id into v_pais from wms_compras where id = p_compra and tipo = 'pais' for update;
  if v_pais is null then
    raise exception 'Solo las compras de un país llevan productos del inventario.';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_sku::text || v_pais::text));
  if p_lote is not null then
    v_lote := p_lote;
  else
    select coalesce(max(i.lote_numero), 0) + 1 into v_lote
      from wms_compra_items i join wms_compras c on c.id = i.compra_id
     where i.sku_maestro_id = p_sku and c.pais_id = v_pais;
  end if;
  insert into wms_compra_items (compra_id, sku_maestro_id, cantidad_pedida, costo_unitario, lote_numero, origen, creado_por)
  values (p_compra, p_sku, p_cantidad, p_costo, v_lote, coalesce(p_origen, 'sistema'), p_usuario)
  returning id into v_id;
  return v_id;
end;
$$;

-- Códigos: Panamá a ECOM01 y el error de México a ECOM02, en el nombre; y el código a su columna.
update wms_compras set nombre = regexp_replace(nombre, '\mECOM-(\d)', 'ECOM01-\1', 'g') where nombre ~ '\mECOM-\d';
update wms_compras set nombre = regexp_replace(nombre, '\mCOM02-(\d)', 'ECOM02-\1', 'g') where nombre ~ '\mCOM02-\d';
update wms_compras set codigo = substring(nombre from '\m(ECOM\d{2}-\d{3,5})\M') where codigo is null and nombre ~ '\mECOM\d{2}-\d{3,5}\M';
