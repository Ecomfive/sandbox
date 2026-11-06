-- Cajas por producto y ubicación (7 nov 2026, pedido de Hernán, a través de Yanixia y Nicol): cuántas cajas hay de cada producto, de qué tamaño y dónde, para
-- que Nicol sepa cuántas puede pedir enviar a una plataforma como Boxfull. El stock sigue en `wms_stock`: las cajas dicen cómo está guardado.

create table if not exists wms_cajas (
  id uuid primary key default uuid_v7(),
  bodega_id uuid not null references wms_bodegas(id),
  sku_maestro_id uuid not null references skus_maestros(id),
  ubicacion_id uuid not null references wms_ubicaciones(id),
  unidades_por_caja integer not null check (unidades_por_caja > 0),
  cajas integer not null check (cajas > 0),
  observacion text,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja)
);
create index if not exists wms_cajas_sku on wms_cajas (sku_maestro_id);
alter table wms_cajas enable row level security;

-- Qué cajas salieron en cada línea de una remisión: [{ ubicacion, cajas, por_caja }], para la ficha y el papel.
alter table wms_envios_dropi add column if not exists cajas jsonb;

-- Los lugares de la Oficina de Costa Rica (los del Excel de Yanixia).
insert into wms_ubicaciones (bodega_id, codigo, notas)
select b.id, u.codigo, u.notas
from wms_bodegas b
join paises p on p.id = b.pais_id
cross join (values ('C1', 'Cuarto 1'), ('C2', 'Cuarto 2'), ('C3', 'Cuarto 3'), ('C4', 'Cuarto 4'), ('CP1', 'Cuarto de Pila'), ('PB1', 'Planta Baja'), ('T1', 'Sala')) as u(codigo, notas)
where p.codigo = 'CR' and b.codigo = 'oficina'
on conflict (bodega_id, codigo) do nothing;

-- Deja las cajas de cada producto como se contaron y exige que sumen el stock físico de la bodega: `p_cajas` = [{ sku, lineas: [{ ubicacion, cajas, por_caja,
-- observacion? }] }]. Un producto sin líneas se queda sin cajas. Va después del conteo, en la misma transacción.
create or replace function wms_guardar_cajas(p_bodega uuid, p_cajas jsonb, p_usuario uuid default null) returns integer
language plpgsql as $$
declare
  v_item jsonb;
  v_linea jsonb;
  v_sku uuid;
  v_ubicacion uuid;
  v_cajas integer;
  v_por integer;
  v_suma integer;
  v_fisico integer;
  v_codigo text;
  v_productos integer := 0;
begin
  if p_cajas is null or jsonb_typeof(p_cajas) <> 'array' then return 0; end if;
  for v_item in select * from jsonb_array_elements(p_cajas) loop
    v_sku := (v_item ->> 'sku')::uuid;
    select codigo into v_codigo from skus_maestros where id = v_sku;
    if not found then raise exception 'Un producto de las cajas no existe.'; end if;
    delete from wms_cajas where bodega_id = p_bodega and sku_maestro_id = v_sku;
    v_suma := 0;
    for v_linea in select * from jsonb_array_elements(coalesce(v_item -> 'lineas', '[]'::jsonb)) loop
      v_ubicacion := (v_linea ->> 'ubicacion')::uuid;
      v_cajas := (v_linea ->> 'cajas')::integer;
      v_por := (v_linea ->> 'por_caja')::integer;
      if v_cajas is null or v_cajas <= 0 or v_por is null or v_por <= 0 then
        raise exception 'Las cajas de % no son válidas.', v_codigo;
      end if;
      if not exists (select 1 from wms_ubicaciones where id = v_ubicacion and bodega_id = p_bodega and activa) then
        raise exception 'Una ubicación de % no es de esta bodega.', v_codigo;
      end if;
      insert into wms_cajas (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja, cajas, observacion, actualizado_por)
      values (p_bodega, v_sku, v_ubicacion, v_por, v_cajas, nullif(btrim(v_linea ->> 'observacion'), ''), p_usuario)
      on conflict (bodega_id, sku_maestro_id, ubicacion_id, unidades_por_caja)
      do update set cajas = wms_cajas.cajas + excluded.cajas, observacion = coalesce(excluded.observacion, wms_cajas.observacion), actualizado_por = p_usuario, actualizado_en = now();
      v_suma := v_suma + v_cajas * v_por;
    end loop;
    select coalesce(fisico, 0) into v_fisico from wms_stock where bodega_id = p_bodega and sku_maestro_id = v_sku;
    v_fisico := coalesce(v_fisico, 0);
    if v_suma > 0 and v_suma <> v_fisico then
      raise exception 'Las cajas de % suman % unidades y el stock es %.', v_codigo, v_suma, v_fisico;
    end if;
    v_productos := v_productos + 1;
  end loop;
  return v_productos;
end;
$$;

-- El levantamiento con sus cajas: lo contado queda en el stock y las cajas se guardan después, todo o nada. `p_items` puede venir vacío (solo cambian las cajas).
create or replace function wms_registrar_conteo_cajas(
  p_bodega uuid,
  p_items jsonb,
  p_cajas jsonb,
  p_referencia text default null,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_r jsonb := '{"productos": 0, "ajustes": 0}'::jsonb;
begin
  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    v_r := wms_registrar_conteo(p_bodega, p_items, p_referencia, p_usuario);
  end if;
  return v_r || jsonb_build_object('cajas', wms_guardar_cajas(p_bodega, p_cajas, p_usuario));
end;
$$;

-- La remisión descuenta las cajas elegidas: `p_items` = [{ sku, cantidad, lote?, cajas?: [{ id, cajas }] }]. Si el producto tiene cajas en la bodega de salida hay
-- que elegirlas, y deben sumar la cantidad. Es todo o nada, como siempre.
create or replace function wms_crear_remision(
  p_desde uuid,
  p_hacia uuid,
  p_items jsonb,
  p_notas text default null,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_id uuid;
  v_numero integer;
  v_codigo text;
  v_item jsonb;
  v_elegida jsonb;
  v_envio uuid;
  v_sku uuid;
  v_sku_codigo text;
  v_cantidad integer;
  v_pide integer;
  v_caja record;
  v_suma integer;
  v_detalle jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La remisión no tiene productos.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en la remisión.';
  end if;
  insert into wms_remisiones (bodega_origen_id, bodega_destino_id, notas, creado_por)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario)
  returning id, numero into v_id, v_numero;
  v_codigo := 'REM-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := (v_item ->> 'sku')::uuid;
    v_cantidad := (v_item ->> 'cantidad')::integer;
    select codigo into v_sku_codigo from skus_maestros where id = v_sku;
    v_suma := 0;
    v_detalle := '[]'::jsonb;
    for v_elegida in select * from jsonb_array_elements(coalesce(v_item -> 'cajas', '[]'::jsonb)) loop
      v_pide := (v_elegida ->> 'cajas')::integer;
      select c.id, c.cajas, c.unidades_por_caja, u.codigo into v_caja
      from wms_cajas c join wms_ubicaciones u on u.id = c.ubicacion_id
      where c.id = (v_elegida ->> 'id')::uuid and c.bodega_id = p_desde and c.sku_maestro_id = v_sku
      for update of c;
      if not found then raise exception 'Las cajas de % cambiaron: vuelve a elegirlas.', v_sku_codigo; end if;
      if v_pide is null or v_pide <= 0 or v_pide > v_caja.cajas then
        raise exception 'De % solo quedan % cajas de % en %.', v_sku_codigo, v_caja.cajas, v_caja.unidades_por_caja, v_caja.codigo;
      end if;
      if v_pide = v_caja.cajas then
        delete from wms_cajas where id = v_caja.id;
      else
        update wms_cajas set cajas = cajas - v_pide, actualizado_por = p_usuario, actualizado_en = now() where id = v_caja.id;
      end if;
      v_suma := v_suma + v_pide * v_caja.unidades_por_caja;
      v_detalle := v_detalle || jsonb_build_object('ubicacion', v_caja.codigo, 'cajas', v_pide, 'por_caja', v_caja.unidades_por_caja);
    end loop;
    if jsonb_array_length(v_detalle) > 0 then
      if v_suma <> v_cantidad then raise exception 'Las cajas de % suman % unidades, no %.', v_sku_codigo, v_suma, v_cantidad; end if;
    elsif exists (select 1 from wms_cajas where bodega_id = p_desde and sku_maestro_id = v_sku) then
      raise exception '% está guardado por cajas: elige las cajas en «Nueva remisión».', v_sku_codigo;
    end if;
    v_envio := wms_enviar_a_externa(v_sku, p_desde, p_hacia, v_cantidad, nullif(v_item ->> 'lote', '')::uuid, v_codigo, p_usuario);
    update wms_envios_dropi
       set remision_id = v_id, cajas = case when jsonb_array_length(v_detalle) > 0 then v_detalle end
     where id = v_envio;
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;
