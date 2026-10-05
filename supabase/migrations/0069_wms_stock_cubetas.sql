-- WMS, fase B: inventario por cubetas, por SKU maestro y bodega, con un libro de movimientos que no se edita.
-- (Modelo tomado de `StockList`/`StockBin`/`QTYRecorder` de GreaterWMS; ver WMS-REFERENCIA.md.)
--
-- * wms_stock: una fila por SKU maestro y bodega, con las cubetas. `disponible` NO se guarda a mano: es lo que queda del
--   físico después de lo reservado, dañado, en inspección y retenido (columna generada). `en_camino` es lo que aún no llegó
--   (no es físico). Se crea la primera vez que el SKU se mueve en esa bodega; mientras tanto vale cero.
-- * wms_stock_ubicacion: lo mismo por ubicación (bin). La propiedad del bin decide a qué cubeta suma lo que se guarde ahí
--   (normal: solo físico; dañado, inspección o retenido: físico y esa cubeta).
-- * wms_movimientos: el libro. Cada cambio de cantidad deja una fila con sus `cambios` por cubeta; nunca se edita ni se borra
--   (un disparador lo impide), así que las cubetas se pueden reconstruir sumando el libro.
-- * Cada cambio de cantidad es UNA función (`wms_registrar_movimiento`, `wms_trasladar`) que actualiza las cubetas y escribe el
--   movimiento en la misma transacción, con `UPDATE ... SET x = x + n`: dos personas a la vez no se pisan.
--
-- El inventario nace VACÍO a propósito (decisión de Hernán, oct 2026): primero se arman los módulos y las conexiones, y las
-- cantidades llegan por entradas, salidas y sincronizaciones. Un saldo puede quedar NEGATIVO: no hay restricción de >= 0, así
-- una salida que llega antes que su entrada se registra y se corrige después con una entrada o un ajuste.
-- En una bodega externa (Dropi, Effi, Boxful, Dunamixfy) el stock es de solo lectura aquí: solo lo cambia una sincronización.
-- Las combos no guardan stock: se calcula de sus componentes (`wms_stock_resumen`).
-- Las tablas nuevas llevan RLS y ninguna política: solo el servidor las toca (ver migración 0063 y SEGURIDAD.md).

create table if not exists wms_stock (
  sku_maestro_id uuid not null references skus_maestros(id),
  bodega_id uuid not null references wms_bodegas(id),
  fisico integer not null default 0,
  reservado integer not null default 0,
  danado integer not null default 0,
  inspeccion integer not null default 0,
  retenido integer not null default 0,
  en_camino integer not null default 0,
  disponible integer generated always as (fisico - reservado - danado - inspeccion - retenido) stored,
  actualizado_en timestamptz not null default now(),
  primary key (sku_maestro_id, bodega_id)
);

create table if not exists wms_stock_ubicacion (
  sku_maestro_id uuid not null references skus_maestros(id),
  ubicacion_id uuid not null references wms_ubicaciones(id),
  cantidad integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (sku_maestro_id, ubicacion_id)
);

create table if not exists wms_movimientos (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  sku_maestro_id uuid not null references skus_maestros(id),
  bodega_id uuid not null references wms_bodegas(id),
  ubicacion_id uuid references wms_ubicaciones(id),
  ubicacion_origen_id uuid references wms_ubicaciones(id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'reserva', 'liberacion', 'traslado')),
  -- Lo que cambió en cada cubeta: {"fisico": 10, "danado": 10}.
  cambios jsonb not null,
  origen text not null default 'manual' check (origen in ('manual', 'sync_dropi', 'sync_shopify', 'pedido', 'conteo')),
  referencia text,
  motivo text,
  usuario_id uuid references auth.users(id)
);
create index if not exists wms_movimientos_sku on wms_movimientos (sku_maestro_id, creado_en desc);
create index if not exists wms_movimientos_bodega on wms_movimientos (bodega_id, creado_en desc);
create index if not exists wms_stock_bodega on wms_stock (bodega_id);

alter table wms_stock enable row level security;
alter table wms_stock_ubicacion enable row level security;
alter table wms_movimientos enable row level security;

-- El libro no se edita ni se borra.
create or replace function wms_movimientos_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'El libro de movimientos no se edita ni se borra.';
end;
$$;
drop trigger if exists wms_movimientos_sin_cambios on wms_movimientos;
create trigger wms_movimientos_sin_cambios before update or delete on wms_movimientos
  for each row execute function wms_movimientos_inmutable();
drop trigger if exists wms_movimientos_sin_vaciar on wms_movimientos;
create trigger wms_movimientos_sin_vaciar before truncate on wms_movimientos
  for each statement execute function wms_movimientos_inmutable();

-- Suma `p_cambios` (cubeta → cantidad) a la fila de stock del SKU en la bodega, creándola si no existe.
create or replace function wms_aplicar_cambios(p_sku uuid, p_bodega uuid, p_cambios jsonb) returns void
language plpgsql as $$
begin
  insert into wms_stock (sku_maestro_id, bodega_id) values (p_sku, p_bodega) on conflict do nothing;
  update wms_stock set
    fisico = fisico + coalesce((p_cambios ->> 'fisico')::integer, 0),
    reservado = reservado + coalesce((p_cambios ->> 'reservado')::integer, 0),
    danado = danado + coalesce((p_cambios ->> 'danado')::integer, 0),
    inspeccion = inspeccion + coalesce((p_cambios ->> 'inspeccion')::integer, 0),
    retenido = retenido + coalesce((p_cambios ->> 'retenido')::integer, 0),
    en_camino = en_camino + coalesce((p_cambios ->> 'en_camino')::integer, 0),
    actualizado_en = now()
  where sku_maestro_id = p_sku and bodega_id = p_bodega;
end;
$$;

-- La cubeta extra a la que suma lo que se guarda en una ubicación según su propiedad (null si es normal).
create or replace function wms_cubeta_de_propiedad(p_propiedad text) returns text
language sql immutable as $$
  select case p_propiedad when 'danado' then 'danado' when 'inspeccion' then 'inspeccion' when 'retenido' then 'retenido' else null end
$$;

-- Registra un movimiento y actualiza las cubetas en una sola transacción. Tipos:
--   entrada / salida: `p_cantidad` positiva; suma o resta del físico (y de la ubicación y su cubeta, si se da una).
--   ajuste: `p_cantidad` con signo; corrige el físico. Pide motivo.
--   reserva / liberacion: `p_cantidad` positiva; sube o baja lo reservado.
-- Una bodega externa solo acepta movimientos de una sincronización. Devuelve el id del movimiento.
create or replace function wms_registrar_movimiento(
  p_sku uuid,
  p_bodega uuid,
  p_tipo text,
  p_cantidad integer,
  p_ubicacion uuid default null,
  p_origen text default 'manual',
  p_referencia text default null,
  p_motivo text default null,
  p_usuario uuid default null
) returns uuid
language plpgsql as $$
declare
  v_tipo_bodega text;
  v_propiedad text;
  v_cubeta text;
  v_delta integer;
  v_cambios jsonb;
  v_id uuid;
begin
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero.';
  end if;
  if p_tipo in ('entrada', 'salida', 'reserva', 'liberacion') and p_cantidad < 0 then
    raise exception 'La cantidad de una % debe ser positiva.', p_tipo;
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste', 'reserva', 'liberacion') then
    raise exception 'Tipo de movimiento no válido: %.', p_tipo;
  end if;
  if p_tipo = 'ajuste' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Un ajuste necesita un motivo.';
  end if;

  select tipo into v_tipo_bodega from wms_bodegas where id = p_bodega;
  if not found then
    raise exception 'La bodega no existe.';
  end if;
  if v_tipo_bodega = 'externa' and p_origen not in ('sync_dropi', 'sync_shopify') then
    raise exception 'Esta bodega es externa: su stock solo lo cambia la sincronización.';
  end if;
  if not exists (select 1 from skus_maestros where id = p_sku) then
    raise exception 'El SKU maestro no existe.';
  end if;

  if p_ubicacion is not null then
    select propiedad into v_propiedad from wms_ubicaciones where id = p_ubicacion and bodega_id = p_bodega;
    if not found then
      raise exception 'La ubicación no es de esa bodega.';
    end if;
  end if;

  if p_tipo in ('entrada', 'salida', 'ajuste') then
    v_delta := case p_tipo when 'entrada' then p_cantidad when 'salida' then -p_cantidad else p_cantidad end;
    v_cambios := jsonb_build_object('fisico', v_delta);
    v_cubeta := wms_cubeta_de_propiedad(v_propiedad);
    if v_cubeta is not null then
      v_cambios := v_cambios || jsonb_build_object(v_cubeta, v_delta);
    end if;
  elsif p_tipo = 'reserva' then
    v_cambios := jsonb_build_object('reservado', p_cantidad);
  else
    v_cambios := jsonb_build_object('reservado', -p_cantidad);
  end if;

  perform wms_aplicar_cambios(p_sku, p_bodega, v_cambios);

  if p_ubicacion is not null and p_tipo in ('entrada', 'salida', 'ajuste') then
    insert into wms_stock_ubicacion (sku_maestro_id, ubicacion_id, cantidad) values (p_sku, p_ubicacion, v_delta)
    on conflict (sku_maestro_id, ubicacion_id) do update set cantidad = wms_stock_ubicacion.cantidad + v_delta, actualizado_en = now();
  end if;

  insert into wms_movimientos (sku_maestro_id, bodega_id, ubicacion_id, tipo, cambios, origen, referencia, motivo, usuario_id)
  values (p_sku, p_bodega, p_ubicacion, p_tipo, v_cambios, p_origen, p_referencia, p_motivo, p_usuario)
  returning id into v_id;
  return v_id;
end;
$$;

-- Pasa `p_cantidad` de una ubicación a otra de la misma bodega. El físico no cambia; sí cambian las cubetas si las dos
-- ubicaciones tienen propiedades distintas (de normal a dañado, por ejemplo). Devuelve el id del movimiento.
create or replace function wms_trasladar(
  p_sku uuid,
  p_bodega uuid,
  p_desde uuid,
  p_hasta uuid,
  p_cantidad integer,
  p_referencia text default null,
  p_motivo text default null,
  p_usuario uuid default null
) returns uuid
language plpgsql as $$
declare
  v_tipo_bodega text;
  v_prop_desde text;
  v_prop_hasta text;
  v_cambios jsonb := '{}'::jsonb;
  v_c_desde text;
  v_c_hasta text;
  v_id uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a trasladar debe ser positiva.';
  end if;
  if p_desde = p_hasta then
    raise exception 'La ubicación de origen y la de destino son la misma.';
  end if;
  select tipo into v_tipo_bodega from wms_bodegas where id = p_bodega;
  if not found then
    raise exception 'La bodega no existe.';
  end if;
  if v_tipo_bodega = 'externa' then
    raise exception 'Esta bodega es externa: su stock solo lo cambia la sincronización.';
  end if;
  select propiedad into v_prop_desde from wms_ubicaciones where id = p_desde and bodega_id = p_bodega;
  if not found then
    raise exception 'La ubicación de origen no es de esa bodega.';
  end if;
  select propiedad into v_prop_hasta from wms_ubicaciones where id = p_hasta and bodega_id = p_bodega;
  if not found then
    raise exception 'La ubicación de destino no es de esa bodega.';
  end if;

  v_c_desde := wms_cubeta_de_propiedad(v_prop_desde);
  v_c_hasta := wms_cubeta_de_propiedad(v_prop_hasta);
  if v_c_desde is distinct from v_c_hasta then
    if v_c_desde is not null then v_cambios := v_cambios || jsonb_build_object(v_c_desde, -p_cantidad); end if;
    if v_c_hasta is not null then v_cambios := v_cambios || jsonb_build_object(v_c_hasta, p_cantidad); end if;
  end if;

  if v_cambios <> '{}'::jsonb then
    perform wms_aplicar_cambios(p_sku, p_bodega, v_cambios);
  end if;
  insert into wms_stock_ubicacion (sku_maestro_id, ubicacion_id, cantidad) values (p_sku, p_desde, -p_cantidad)
  on conflict (sku_maestro_id, ubicacion_id) do update set cantidad = wms_stock_ubicacion.cantidad - p_cantidad, actualizado_en = now();
  insert into wms_stock_ubicacion (sku_maestro_id, ubicacion_id, cantidad) values (p_sku, p_hasta, p_cantidad)
  on conflict (sku_maestro_id, ubicacion_id) do update set cantidad = wms_stock_ubicacion.cantidad + p_cantidad, actualizado_en = now();

  insert into wms_movimientos (sku_maestro_id, bodega_id, ubicacion_id, ubicacion_origen_id, tipo, cambios, origen, referencia, motivo, usuario_id)
  values (p_sku, p_bodega, p_hasta, p_desde, 'traslado', v_cambios, 'manual', p_referencia, p_motivo, p_usuario)
  returning id into v_id;
  return v_id;
end;
$$;

-- El stock de cada SKU maestro en un país (sumando sus bodegas, o solo `p_bodega`). Trae TODOS los SKU, también los que nunca
-- se movieron (en cero). Un combo no guarda stock: su físico y su disponible salen de sus componentes (los que alcanzan
-- para armar), y sus demás cubetas van en cero.
create or replace function wms_stock_resumen(p_pais uuid, p_bodega uuid default null)
returns table (
  sku_maestro_id uuid, codigo text, nombre text, tipo text, estado text,
  fisico bigint, reservado bigint, disponible bigint, danado bigint, inspeccion bigint, retenido bigint, en_camino bigint
)
language sql stable as $$
  with base as (
    select s.sku_maestro_id,
      sum(s.fisico) as fisico, sum(s.reservado) as reservado, sum(s.disponible) as disponible,
      sum(s.danado) as danado, sum(s.inspeccion) as inspeccion, sum(s.retenido) as retenido, sum(s.en_camino) as en_camino
    from wms_stock s
    join wms_bodegas b on b.id = s.bodega_id
    where b.pais_id = p_pais and (p_bodega is null or s.bodega_id = p_bodega)
    group by s.sku_maestro_id
  ),
  combos as (
    select c.combo_id,
      min(floor(coalesce(b.fisico, 0)::numeric / c.cantidad))::bigint as fisico,
      min(floor(coalesce(b.disponible, 0)::numeric / c.cantidad))::bigint as disponible
    from sku_maestro_componentes c
    left join base b on b.sku_maestro_id = c.componente_id
    group by c.combo_id
  )
  select m.id, m.codigo, m.nombre, m.tipo, m.estado,
    case when m.tipo = 'combo' then coalesce(k.fisico, 0) else coalesce(b.fisico, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.reservado, 0) end,
    case when m.tipo = 'combo' then coalesce(k.disponible, 0) else coalesce(b.disponible, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.danado, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.inspeccion, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.retenido, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.en_camino, 0) end
  from skus_maestros m
  left join base b on b.sku_maestro_id = m.id
  left join combos k on k.combo_id = m.id
  order by m.codigo
$$;

-- El stock de un SKU en cada bodega de un país (también las que no tienen fila: en cero).
create or replace function wms_stock_por_bodega(p_sku uuid, p_pais uuid)
returns table (
  bodega_id uuid, codigo text, nombre text, tipo text,
  fisico integer, reservado integer, disponible integer, danado integer, inspeccion integer, retenido integer, en_camino integer
)
language sql stable as $$
  select b.id, b.codigo, b.nombre, b.tipo,
    coalesce(s.fisico, 0), coalesce(s.reservado, 0), coalesce(s.disponible, 0), coalesce(s.danado, 0),
    coalesce(s.inspeccion, 0), coalesce(s.retenido, 0), coalesce(s.en_camino, 0)
  from wms_bodegas b
  left join wms_stock s on s.bodega_id = b.id and s.sku_maestro_id = p_sku
  where b.pais_id = p_pais
  order by b.tipo, b.nombre
$$;
