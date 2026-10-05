-- Lotes y vencimiento (WMS): los productos con fecha de caducidad se llevan por lote.
--
-- * skus_maestros.maneja_vencimiento: el producto se controla por lote y fecha de vencimiento. dias_aviso_vencimiento: con
--   cuántos días de anticipación se avisa que un lote está por vencer (sin dato, 60). Un compuesto no maneja vencimiento (sale
--   de sus componentes). Solo se puede activar si el producto no tiene stock (el que ya existe no tendría lote) y desactivar si
--   ningún lote tiene unidades.
-- * wms_lotes: un lote de un producto, con su fecha de vencimiento. wms_stock_lote: cuánto hay de cada lote en cada bodega.
--   El libro de movimientos guarda el lote de cada movimiento (`lote_id`).
-- * Una ENTRADA de un producto con vencimiento pide el lote y su fecha (el lote nuevo se crea solo). Una SALIDA o un despacho sin lote
--   sale por FEFO: primero lo que vence antes, y nunca de un lote vencido (se puede sacar un lote vencido nombrándolo, para darlo de
--   baja). Si los lotes vigentes no alcanzan, falla y no cambia nada. Reservar no necesita lote: el lote se elige al despachar.
-- * Un lote vencido NO cuenta como disponible: el inventario lo muestra aparte (`vencido`) y lo resta de lo disponible, sin tareas
--   programadas (se calcula con la fecha de hoy en Panamá).
-- Las tablas nuevas llevan RLS y ninguna política: solo el servidor las toca (ver migración 0063 y SEGURIDAD.md).

alter table skus_maestros
  add column if not exists maneja_vencimiento boolean not null default false,
  add column if not exists dias_aviso_vencimiento integer check (dias_aviso_vencimiento is null or dias_aviso_vencimiento between 1 and 3650);
alter table skus_maestros drop constraint if exists skus_maestros_compuesto_sin_vencimiento;
alter table skus_maestros add constraint skus_maestros_compuesto_sin_vencimiento check (tipo <> 'combo' or not maneja_vencimiento);

create table if not exists wms_lotes (
  id uuid primary key default uuid_v7(),
  sku_maestro_id uuid not null references skus_maestros(id),
  codigo text not null check (btrim(codigo) <> ''),
  fecha_vencimiento date not null,
  fecha_fabricacion date,
  notas text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);
create unique index if not exists wms_lotes_codigo_unico on wms_lotes (sku_maestro_id, lower(btrim(codigo)));
create index if not exists wms_lotes_vencimiento on wms_lotes (fecha_vencimiento);

create table if not exists wms_stock_lote (
  lote_id uuid not null references wms_lotes(id),
  bodega_id uuid not null references wms_bodegas(id),
  cantidad integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (lote_id, bodega_id)
);
create index if not exists wms_stock_lote_bodega on wms_stock_lote (bodega_id);

alter table wms_movimientos add column if not exists lote_id uuid references wms_lotes(id);
create index if not exists wms_movimientos_lote on wms_movimientos (lote_id) where lote_id is not null;

alter table wms_lotes enable row level security;
alter table wms_stock_lote enable row level security;

-- «Hoy» para el vencimiento: la fecha de Panamá (sin cambio de hora; Costa Rica va una hora atrás y no afecta el día).
create or replace function wms_hoy() returns date language sql stable as $$
  select (now() at time zone 'America/Panama')::date
$$;

-- Activar o desactivar el control de vencimiento solo cuando no deja stock sin lote ni lotes con unidades.
create or replace function skus_maestros_vencimiento_guardia() returns trigger language plpgsql as $$
begin
  if new.maneja_vencimiento = old.maneja_vencimiento then
    return new;
  end if;
  if new.maneja_vencimiento then
    if exists (select 1 from wms_stock where sku_maestro_id = new.id and fisico <> 0) then
      raise exception 'El producto ya tiene stock sin lote: llévalo a cero antes de activar el vencimiento.';
    end if;
  elsif exists (select 1 from wms_lotes l join wms_stock_lote s on s.lote_id = l.id where l.sku_maestro_id = new.id and s.cantidad <> 0) then
    raise exception 'Hay lotes con unidades: sácalos antes de desactivar el vencimiento.';
  end if;
  return new;
end;
$$;
drop trigger if exists skus_maestros_vencimiento on skus_maestros;
create trigger skus_maestros_vencimiento before update of maneja_vencimiento on skus_maestros
  for each row execute function skus_maestros_vencimiento_guardia();

-- De qué lotes salen `p_cantidad` unidades de un producto en una bodega: primero lo que vence antes y nunca un lote vencido.
-- Bloquea las filas de lote, así que dos salidas a la vez no toman las mismas unidades. Falla si los lotes vigentes no alcanzan.
create or replace function wms_asignar_lotes(p_sku uuid, p_bodega uuid, p_cantidad integer)
returns table (lote_id uuid, cantidad integer)
language plpgsql as $$
declare
  v_falta integer := p_cantidad;
  v_fila record;
  v_toma integer;
begin
  for v_fila in
    select s.lote_id as lote, s.cantidad as disponible
    from wms_stock_lote s
    join wms_lotes l on l.id = s.lote_id
    where l.sku_maestro_id = p_sku and s.bodega_id = p_bodega and s.cantidad > 0 and l.fecha_vencimiento >= wms_hoy()
    order by l.fecha_vencimiento, l.creado_en, l.id
    for update of s
  loop
    exit when v_falta <= 0;
    v_toma := least(v_falta, v_fila.disponible);
    lote_id := v_fila.lote;
    cantidad := v_toma;
    return next;
    v_falta := v_falta - v_toma;
  end loop;
  if v_falta > 0 then
    raise exception 'No alcanzan los lotes vigentes: faltan % unidades.', v_falta;
  end if;
end;
$$;

-- El movimiento de siempre, ahora con lote: entrada (lote y fecha), salida (por FEFO si no se nombra lote) y ajuste (con lote).
drop function if exists wms_registrar_movimiento(uuid, uuid, text, integer, uuid, text, text, text, uuid);
create or replace function wms_registrar_movimiento(
  p_sku uuid,
  p_bodega uuid,
  p_tipo text,
  p_cantidad integer,
  p_ubicacion uuid default null,
  p_origen text default 'manual',
  p_referencia text default null,
  p_motivo text default null,
  p_usuario uuid default null,
  p_lote uuid default null,
  p_lote_codigo text default null,
  p_vencimiento date default null
) returns uuid
language plpgsql as $$
declare
  v_tipo_bodega text;
  v_propiedad text;
  v_cubeta text;
  v_delta integer;
  v_cambios jsonb;
  v_id uuid;
  v_maneja boolean;
  v_lote uuid := p_lote;
  v_asignado record;
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
  select maneja_vencimiento into v_maneja from skus_maestros where id = p_sku;
  if not found then
    raise exception 'El SKU maestro no existe.';
  end if;
  if not v_maneja and (p_lote is not null or p_lote_codigo is not null or p_vencimiento is not null) then
    raise exception 'Este producto no maneja vencimiento.';
  end if;

  if p_ubicacion is not null then
    select propiedad into v_propiedad from wms_ubicaciones where id = p_ubicacion and bodega_id = p_bodega;
    if not found then
      raise exception 'La ubicación no es de esa bodega.';
    end if;
  end if;

  -- Producto con vencimiento: de qué lote se mueve.
  if v_maneja and p_tipo in ('entrada', 'salida', 'ajuste') then
    if p_tipo = 'salida' and p_lote is null and coalesce(btrim(p_lote_codigo), '') = '' then
      -- Sin lote: FEFO. Un movimiento por cada lote del que sale.
      for v_asignado in select * from wms_asignar_lotes(p_sku, p_bodega, p_cantidad) loop
        v_id := wms_registrar_movimiento(p_sku, p_bodega, 'salida', v_asignado.cantidad, p_ubicacion, p_origen, p_referencia, p_motivo, p_usuario, v_asignado.lote_id);
      end loop;
      return v_id;
    end if;
    if v_lote is null then
      if coalesce(btrim(p_lote_codigo), '') = '' then
        raise exception 'Este producto maneja vencimiento: indica el lote.';
      end if;
      select id into v_lote from wms_lotes where sku_maestro_id = p_sku and lower(btrim(codigo)) = lower(btrim(p_lote_codigo));
      if v_lote is null then
        if p_tipo <> 'entrada' then
          raise exception 'El lote % no existe.', p_lote_codigo;
        end if;
        if p_vencimiento is null then
          raise exception 'Un lote nuevo necesita su fecha de vencimiento.';
        end if;
        insert into wms_lotes (sku_maestro_id, codigo, fecha_vencimiento, creado_por)
        values (p_sku, btrim(p_lote_codigo), p_vencimiento, p_usuario)
        returning id into v_lote;
      elsif p_tipo = 'entrada' and p_vencimiento is not null and p_vencimiento <> (select fecha_vencimiento from wms_lotes where id = v_lote) then
        raise exception 'El lote ya existe con otra fecha de vencimiento.';
      end if;
    elsif not exists (select 1 from wms_lotes where id = v_lote and sku_maestro_id = p_sku) then
      raise exception 'El lote no es de ese producto.';
    end if;
  else
    v_lote := null;
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
  if v_lote is not null then
    insert into wms_stock_lote (lote_id, bodega_id, cantidad) values (v_lote, p_bodega, v_delta)
    on conflict (lote_id, bodega_id) do update set cantidad = wms_stock_lote.cantidad + v_delta, actualizado_en = now();
  end if;

  insert into wms_movimientos (sku_maestro_id, bodega_id, ubicacion_id, tipo, cambios, origen, referencia, motivo, usuario_id, lote_id)
  values (p_sku, p_bodega, p_ubicacion, p_tipo, v_cambios, p_origen, p_referencia, p_motivo, p_usuario, v_lote)
  returning id into v_id;
  return v_id;
end;
$$;

-- El resumen del inventario con lo vencido: un lote vencido se muestra aparte y no cuenta como disponible.
drop function if exists wms_stock_resumen(uuid, uuid);
create or replace function wms_stock_resumen(p_pais uuid, p_bodega uuid default null)
returns table (
  sku_maestro_id uuid, codigo text, nombre text, tipo text, clase text, maneja_vencimiento boolean,
  fisico bigint, reservado bigint, disponible bigint, danado bigint, inspeccion bigint, retenido bigint, en_camino bigint, vencido bigint
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
  venc as (
    select l.sku_maestro_id, sum(sl.cantidad) as vencido
    from wms_stock_lote sl
    join wms_lotes l on l.id = sl.lote_id
    join wms_bodegas b on b.id = sl.bodega_id
    where b.pais_id = p_pais and (p_bodega is null or sl.bodega_id = p_bodega) and l.fecha_vencimiento < wms_hoy() and sl.cantidad > 0
    group by l.sku_maestro_id
  ),
  combos as (
    select c.combo_id,
      min(floor(coalesce(b.fisico, 0)::numeric / c.cantidad))::bigint as fisico,
      min(floor((coalesce(b.disponible, 0) - coalesce(v.vencido, 0))::numeric / c.cantidad))::bigint as disponible
    from sku_maestro_componentes c
    left join base b on b.sku_maestro_id = c.componente_id
    left join venc v on v.sku_maestro_id = c.componente_id
    group by c.combo_id
  )
  select m.id, m.codigo, m.nombre, m.tipo, m.clase, m.maneja_vencimiento,
    case when m.tipo = 'combo' then coalesce(k.fisico, 0) else coalesce(b.fisico, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.reservado, 0) end,
    case when m.tipo = 'combo' then coalesce(k.disponible, 0) else coalesce(b.disponible, 0) - coalesce(v.vencido, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.danado, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.inspeccion, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.retenido, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(b.en_camino, 0) end,
    case when m.tipo = 'combo' then 0 else coalesce(v.vencido, 0) end
  from skus_maestros m
  left join base b on b.sku_maestro_id = m.id
  left join venc v on v.sku_maestro_id = m.id
  left join combos k on k.combo_id = m.id
  order by m.codigo
$$;

-- El stock de un SKU en cada bodega, con lo vencido.
drop function if exists wms_stock_por_bodega(uuid, uuid);
create or replace function wms_stock_por_bodega(p_sku uuid, p_pais uuid)
returns table (
  bodega_id uuid, codigo text, nombre text, tipo text,
  fisico integer, reservado integer, disponible integer, danado integer, inspeccion integer, retenido integer, en_camino integer, vencido integer
)
language sql stable as $$
  select b.id, b.codigo, b.nombre, b.tipo,
    coalesce(s.fisico, 0), coalesce(s.reservado, 0), coalesce(s.disponible, 0) - coalesce(v.vencido, 0), coalesce(s.danado, 0),
    coalesce(s.inspeccion, 0), coalesce(s.retenido, 0), coalesce(s.en_camino, 0), coalesce(v.vencido, 0)
  from wms_bodegas b
  left join wms_stock s on s.bodega_id = b.id and s.sku_maestro_id = p_sku
  left join lateral (
    select sum(sl.cantidad)::integer as vencido
    from wms_stock_lote sl join wms_lotes l on l.id = sl.lote_id
    where sl.bodega_id = b.id and l.sku_maestro_id = p_sku and l.fecha_vencimiento < wms_hoy() and sl.cantidad > 0
  ) v on true
  where b.pais_id = p_pais
  order by b.tipo, b.nombre
$$;

-- Los lotes de un producto con lo que hay de cada uno en cada bodega del país (solo los que tienen unidades).
create or replace function wms_lotes_de_sku(p_sku uuid, p_pais uuid)
returns table (
  lote_id uuid, lote text, fecha_vencimiento date, dias_restantes integer, estado text,
  bodega_id uuid, bodega text, cantidad integer
)
language sql stable as $$
  select l.id, l.codigo, l.fecha_vencimiento, (l.fecha_vencimiento - wms_hoy())::integer,
    case when l.fecha_vencimiento < wms_hoy() then 'vencido'
         when l.fecha_vencimiento <= wms_hoy() + coalesce(m.dias_aviso_vencimiento, 60) then 'por_vencer'
         else 'vigente' end,
    b.id, b.nombre, sl.cantidad
  from wms_lotes l
  join skus_maestros m on m.id = l.sku_maestro_id
  join wms_stock_lote sl on sl.lote_id = l.id and sl.cantidad <> 0
  join wms_bodegas b on b.id = sl.bodega_id and b.pais_id = p_pais
  where l.sku_maestro_id = p_sku
  order by l.fecha_vencimiento, l.codigo, b.nombre
$$;

-- Todos los lotes del país con unidades, del que vence antes al que vence después: lo vencido y lo que está por vencer.
create or replace function wms_vigilancia_vencimientos(p_pais uuid)
returns table (
  sku_maestro_id uuid, sku text, nombre text, lote_id uuid, lote text, fecha_vencimiento date,
  dias_restantes integer, cantidad bigint, dias_aviso integer, estado text
)
language sql stable as $$
  select m.id, m.codigo, m.nombre, l.id, l.codigo, l.fecha_vencimiento,
    (l.fecha_vencimiento - wms_hoy())::integer,
    sum(sl.cantidad),
    coalesce(m.dias_aviso_vencimiento, 60),
    case when l.fecha_vencimiento < wms_hoy() then 'vencido'
         when l.fecha_vencimiento <= wms_hoy() + coalesce(m.dias_aviso_vencimiento, 60) then 'por_vencer'
         else 'vigente' end
  from wms_lotes l
  join skus_maestros m on m.id = l.sku_maestro_id
  join wms_stock_lote sl on sl.lote_id = l.id
  join wms_bodegas b on b.id = sl.bodega_id and b.pais_id = p_pais
  group by m.id, m.codigo, m.nombre, m.dias_aviso_vencimiento, l.id, l.codigo, l.fecha_vencimiento
  having sum(sl.cantidad) > 0
  order by l.fecha_vencimiento, m.codigo, l.codigo
$$;
