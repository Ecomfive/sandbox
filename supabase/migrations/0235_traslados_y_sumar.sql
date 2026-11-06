-- Inventario (pedido de Hernán, 7 nov 2026), dos cosas:
--   * Traslados entre bodegas propias: cada traslado lleva su número (TRA-0001), varios productos, quién lo hizo y una nota libre (qué traslado, qué fecha, qué número), y se ve en la pestaña
--     Traslados. Cada producto se mueve con `wms_transferir`, así que el stock y los lotes funcionan igual que antes.
--   * Sumar en el Levantamiento: lo escrito se suma a lo que ya está en la bodega, en vez de reemplazarlo.
-- Reversa: supabase/rollbacks/0235_rollback.sql

create sequence if not exists wms_traslados_numero_seq;

create table if not exists wms_traslados (
  id uuid primary key default uuid_v7(),
  numero integer not null unique default nextval('wms_traslados_numero_seq'),
  bodega_origen_id uuid not null references wms_bodegas(id),
  bodega_destino_id uuid not null references wms_bodegas(id),
  notas text,
  creado_por uuid references auth.users(id),
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);
alter sequence wms_traslados_numero_seq owned by wms_traslados.numero;
create index if not exists wms_traslados_fecha on wms_traslados (creado_en desc);
alter table wms_traslados enable row level security;

create table if not exists wms_traslado_items (
  id uuid primary key default uuid_v7(),
  traslado_id uuid not null references wms_traslados(id) on delete restrict,
  sku_maestro_id uuid not null references skus_maestros(id),
  cantidad integer not null check (cantidad > 0),
  unique (traslado_id, sku_maestro_id)
);
alter table wms_traslado_items enable row level security;

-- Todo el traslado o nada: si a un producto no le alcanza el stock, no se mueve ninguno. `p_items` = [{ sku, cantidad, lote? }].
create or replace function wms_crear_traslado(
  p_desde uuid,
  p_hacia uuid,
  p_items jsonb,
  p_notas text default null,
  p_usuario uuid default null,
  p_nombre text default null
) returns jsonb
language plpgsql as $$
declare
  v_id uuid;
  v_numero integer;
  v_codigo text;
  v_item jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El traslado no tiene productos.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en el traslado.';
  end if;
  insert into wms_traslados (bodega_origen_id, bodega_destino_id, notas, creado_por, creado_por_nombre)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario, p_nombre)
  returning id, numero into v_id, v_numero;
  v_codigo := 'TRA-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    perform wms_transferir(
      (v_item ->> 'sku')::uuid, p_desde, p_hacia, (v_item ->> 'cantidad')::integer, nullif(v_item ->> 'lote', '')::uuid, v_codigo, null, p_usuario
    );
    insert into wms_traslado_items (traslado_id, sku_maestro_id, cantidad) values (v_id, (v_item ->> 'sku')::uuid, (v_item ->> 'cantidad')::integer);
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

-- Levantamiento en modo «Sumar»: cada producto entra con lo escrito, sin tocar lo que ya había. Un producto con vencimiento suma por lote; el lote nuevo pide su fecha.
create or replace function wms_sumar_levantamiento(
  p_bodega uuid,
  p_items jsonb,
  p_referencia text default null,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_bodega record;
  v_conteo uuid;
  v_item jsonb;
  v_lote jsonb;
  v_sku uuid;
  v_maneja boolean;
  v_clase text;
  v_tipo text;
  v_cantidad integer;
  v_codigo text;
  v_venc date;
  v_motivo text;
  v_productos integer := 0;
begin
  select tipo, activa into v_bodega from wms_bodegas where id = p_bodega;
  if not found then raise exception 'La bodega no existe.'; end if;
  if v_bodega.tipo <> 'propia' or not v_bodega.activa then
    raise exception 'El levantamiento se hace en una bodega propia y activa.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos para sumar.';
  end if;

  insert into wms_conteos (bodega_id, referencia, usuario_id) values (p_bodega, nullif(btrim(p_referencia), ''), p_usuario)
  returning id into v_conteo;
  v_motivo := 'Suma al inventario' || coalesce(' · ' || nullif(btrim(p_referencia), ''), '');

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := (v_item->>'sku')::uuid;
    select maneja_vencimiento, clase, tipo into v_maneja, v_clase, v_tipo from skus_maestros where id = v_sku;
    if not found then raise exception 'Un producto no existe.'; end if;
    if v_tipo = 'combo' or v_clase = 'test' then continue; end if;
    v_productos := v_productos + 1;
    if not v_maneja then
      v_cantidad := (v_item->>'cantidad')::integer;
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Una cantidad para sumar no es válida.'; end if;
      perform wms_registrar_movimiento(v_sku, p_bodega, 'entrada', v_cantidad, null, 'conteo', v_conteo::text, v_motivo, p_usuario);
    else
      for v_lote in select * from jsonb_array_elements(coalesce(v_item->'lotes', '[]'::jsonb)) loop
        v_codigo := btrim(coalesce(v_lote->>'codigo', ''));
        v_cantidad := (v_lote->>'cantidad')::integer;
        v_venc := nullif(v_lote->>'vencimiento', '')::date;
        if v_codigo = '' then raise exception 'Falta el código de un lote.'; end if;
        if v_cantidad is null or v_cantidad < 0 then raise exception 'Una cantidad para sumar no es válida.'; end if;
        if v_cantidad > 0 then
          perform wms_registrar_movimiento(v_sku, p_bodega, 'entrada', v_cantidad, null, 'conteo', v_conteo::text, v_motivo, p_usuario, null, v_codigo, v_venc);
        end if;
      end loop;
    end if;
  end loop;
  update wms_conteos set productos = v_productos, ajustes = v_productos where id = v_conteo;
  return jsonb_build_object('productos', v_productos, 'ajustes', v_productos);
end;
$$;
