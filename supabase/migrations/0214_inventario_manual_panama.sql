-- Inventario a mano en Panamá (31 oct 2026, pedido de Alcides): dejar de llevar el inventario en ClickUp.
--
-- * Bodegas de Panamá: Despacho Plaza 100, Oficina Ancón (nueva), Fulfillment Ricardo (antes «Deposito Plaza 100») e iStorage
--   (nueva), todas propias (se mueven a mano), más la de Dropi (B280), que sigue externa. Effi, Boxfull, Dunamixfy y «Deposito
--   Principal» se desactivan en Panamá: una bodega no se borra.
-- * Levantamiento (conteo físico) por bodega: `wms_registrar_conteo` deja cada producto contado en la cantidad contada con un
--   ajuste por la diferencia (origen «conteo»). Un producto con vencimiento se cuenta por lote.
-- * Transferencia entre bodegas propias: `wms_transferir` saca de una y mete en la otra en la misma transacción.
-- * Envío a Dropi: `wms_enviar_a_dropi` saca las unidades de una bodega propia y deja el envío «en camino»; cuando Dropi dice
--   cuántas llegaron, `wms_recibir_envio_dropi` lo cierra con la diferencia y su motivo. Lo que hay en la B280 lo sigue diciendo
--   Dropi (su lectura de cada mañana): estos envíos son la base para cuadrarla.
-- Se puede correr dos veces. Reversa: supabase/rollbacks/0214_rollback.sql.

-- Orígenes nuevos del libro.
alter table wms_movimientos drop constraint if exists wms_movimientos_origen_check;
alter table wms_movimientos add constraint wms_movimientos_origen_check
  check (origen in ('manual', 'sync_dropi', 'sync_shopify', 'pedido', 'conteo', 'transferencia', 'envio_dropi'));

-- Bodegas de Panamá.
update wms_bodegas b set nombre = 'Fulfillment Ricardo', actualizado_en = now()
  from paises p
 where p.id = b.pais_id and p.codigo = 'PA' and b.codigo = 'fulfillment' and b.nombre <> 'Fulfillment Ricardo';

insert into wms_bodegas (pais_id, nombre, codigo, tipo, orden)
select p.id, n.nombre, n.codigo, 'propia', n.orden
  from paises p
 cross join (values ('Oficina Ancón', 'oficina_ancon', 2), ('iStorage', 'istorage', 4)) as n(nombre, codigo, orden)
 where p.codigo = 'PA'
   and not exists (select 1 from wms_bodegas b where b.pais_id = p.id and b.codigo = n.codigo);

-- Los nombres con tilde, por si se copiaron mal (31 oct 2026: el portapapeles cambió «Ancón» por «Anc√≥n»).
update wms_bodegas b set nombre = n.nombre, actualizado_en = now()
  from paises p, (values ('oficina_ancon', 'Oficina Ancón'), ('istorage', 'iStorage')) as n(codigo, nombre)
 where p.id = b.pais_id and p.codigo = 'PA' and b.codigo = n.codigo and b.nombre <> n.nombre;

update wms_bodegas b set activa = false, actualizado_en = now()
  from paises p
 where p.id = b.pais_id and p.codigo = 'PA' and b.activa
   and (b.codigo in ('effi', 'boxfull', 'dunamixfy') or (b.codigo is null and b.nombre = 'Deposito Principal'));

-- Cada levantamiento: quién, cuándo, en qué bodega y cuántos productos contó.
create table if not exists wms_conteos (
  id uuid primary key default uuid_v7(),
  bodega_id uuid not null references wms_bodegas(id),
  referencia text,
  productos integer not null default 0,
  ajustes integer not null default 0,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists wms_conteos_bodega on wms_conteos (bodega_id, creado_en desc);
alter table wms_conteos enable row level security;

-- Envíos a Dropi: lo que salió de nuestras bodegas hacia la de Dropi y lo que Dropi dijo que llegó.
create table if not exists wms_envios_dropi (
  id uuid primary key default uuid_v7(),
  sku_maestro_id uuid not null references skus_maestros(id),
  bodega_origen_id uuid not null references wms_bodegas(id),
  bodega_dropi_id uuid not null references wms_bodegas(id),
  enviada integer not null check (enviada > 0),
  recibida integer check (recibida is null or recibida >= 0),
  estado text not null default 'en_camino' check (estado in ('en_camino', 'recibido')),
  referencia text,
  motivo_diferencia text,
  enviado_por uuid references auth.users(id),
  enviado_en timestamptz not null default now(),
  recibido_por uuid references auth.users(id),
  recibido_en timestamptz
);
create index if not exists wms_envios_dropi_sku on wms_envios_dropi (sku_maestro_id, enviado_en desc);
create index if not exists wms_envios_dropi_estado on wms_envios_dropi (estado, enviado_en desc);
alter table wms_envios_dropi enable row level security;

-- Las dos bodegas tienen que ser propias, activas, del mismo país y distintas.
create or replace function wms_revisar_bodegas_transferencia(p_desde uuid, p_hacia uuid) returns void
language plpgsql as $$
declare
  v_desde record;
  v_hacia record;
begin
  if p_desde = p_hacia then
    raise exception 'La bodega de origen y la de destino son la misma.';
  end if;
  select pais_id, tipo, activa into v_desde from wms_bodegas where id = p_desde;
  if not found then raise exception 'La bodega de origen no existe.'; end if;
  select pais_id, tipo, activa into v_hacia from wms_bodegas where id = p_hacia;
  if not found then raise exception 'La bodega de destino no existe.'; end if;
  if v_desde.pais_id <> v_hacia.pais_id then
    raise exception 'Las dos bodegas tienen que ser del mismo país.';
  end if;
  if v_desde.tipo <> 'propia' or v_hacia.tipo <> 'propia' then
    raise exception 'Solo se transfiere entre bodegas propias (a Dropi se manda con «Enviar a Dropi»).';
  end if;
  if not v_desde.activa or not v_hacia.activa then
    raise exception 'Una de las bodegas está desactivada.';
  end if;
end;
$$;

-- Transferencia: una salida en el origen y una entrada en el destino, del mismo lote si el producto vence (si no se elige el
-- lote, sale primero el que vence antes y cada lote entra igual al destino).
create or replace function wms_transferir(
  p_sku uuid,
  p_desde uuid,
  p_hacia uuid,
  p_cantidad integer,
  p_lote uuid default null,
  p_referencia text default null,
  p_motivo text default null,
  p_usuario uuid default null
) returns integer
language plpgsql as $$
declare
  v_maneja boolean;
  v_nombre_desde text;
  v_nombre_hacia text;
  v_asignado record;
  v_movidos integer := 0;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  perform wms_revisar_bodegas_transferencia(p_desde, p_hacia);
  select maneja_vencimiento into v_maneja from skus_maestros where id = p_sku;
  if not found then raise exception 'El SKU maestro no existe.'; end if;
  select nombre into v_nombre_desde from wms_bodegas where id = p_desde;
  select nombre into v_nombre_hacia from wms_bodegas where id = p_hacia;

  if v_maneja and p_lote is not null then
    if not exists (select 1 from wms_lotes where id = p_lote and sku_maestro_id = p_sku) then
      raise exception 'El lote no es de ese producto.';
    end if;
    perform wms_registrar_movimiento(p_sku, p_desde, 'salida', p_cantidad, null, 'transferencia', p_referencia,
      coalesce(nullif(btrim(p_motivo), ''), 'Transferencia a ' || v_nombre_hacia), p_usuario, p_lote);
    perform wms_registrar_movimiento(p_sku, p_hacia, 'entrada', p_cantidad, null, 'transferencia', p_referencia,
      coalesce(nullif(btrim(p_motivo), ''), 'Transferencia desde ' || v_nombre_desde), p_usuario, p_lote);
    v_movidos := p_cantidad;
  elsif v_maneja then
    for v_asignado in select * from wms_asignar_lotes(p_sku, p_desde, p_cantidad) loop
      perform wms_registrar_movimiento(p_sku, p_desde, 'salida', v_asignado.cantidad, null, 'transferencia', p_referencia,
        coalesce(nullif(btrim(p_motivo), ''), 'Transferencia a ' || v_nombre_hacia), p_usuario, v_asignado.lote_id);
      perform wms_registrar_movimiento(p_sku, p_hacia, 'entrada', v_asignado.cantidad, null, 'transferencia', p_referencia,
        coalesce(nullif(btrim(p_motivo), ''), 'Transferencia desde ' || v_nombre_desde), p_usuario, v_asignado.lote_id);
      v_movidos := v_movidos + v_asignado.cantidad;
    end loop;
  else
    if p_lote is not null then raise exception 'Este producto no maneja vencimiento.'; end if;
    perform wms_registrar_movimiento(p_sku, p_desde, 'salida', p_cantidad, null, 'transferencia', p_referencia,
      coalesce(nullif(btrim(p_motivo), ''), 'Transferencia a ' || v_nombre_hacia), p_usuario);
    perform wms_registrar_movimiento(p_sku, p_hacia, 'entrada', p_cantidad, null, 'transferencia', p_referencia,
      coalesce(nullif(btrim(p_motivo), ''), 'Transferencia desde ' || v_nombre_desde), p_usuario);
    v_movidos := p_cantidad;
  end if;
  return v_movidos;
end;
$$;

-- Envío a Dropi: sale de una bodega propia y queda «en camino» hasta que Dropi diga cuántas llegaron.
create or replace function wms_enviar_a_dropi(
  p_sku uuid,
  p_desde uuid,
  p_cantidad integer,
  p_lote uuid default null,
  p_referencia text default null,
  p_usuario uuid default null
) returns uuid
language plpgsql as $$
declare
  v_desde record;
  v_dropi uuid;
  v_envio uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  select pais_id, tipo, activa into v_desde from wms_bodegas where id = p_desde;
  if not found then raise exception 'La bodega de origen no existe.'; end if;
  if v_desde.tipo <> 'propia' or not v_desde.activa then
    raise exception 'El envío sale de una bodega propia y activa.';
  end if;
  select id into v_dropi from wms_bodegas where pais_id = v_desde.pais_id and codigo = 'dropi';
  if v_dropi is null then
    raise exception 'Este país no tiene bodega de Dropi.';
  end if;
  insert into wms_envios_dropi (sku_maestro_id, bodega_origen_id, bodega_dropi_id, enviada, referencia, enviado_por)
  values (p_sku, p_desde, v_dropi, p_cantidad, nullif(btrim(p_referencia), ''), p_usuario)
  returning id into v_envio;
  -- Sin lote en un producto que vence, sale primero el que vence antes (lo resuelve wms_registrar_movimiento).
  perform wms_registrar_movimiento(p_sku, p_desde, 'salida', p_cantidad, null, 'envio_dropi',
    coalesce(nullif(btrim(p_referencia), ''), 'Envío a Dropi'), 'Envío a Dropi (en camino)', p_usuario, p_lote);
  return v_envio;
end;
$$;

-- Dropi confirmó el envío: cuántas llegaron. Si no son las enviadas, el motivo es obligatorio.
create or replace function wms_recibir_envio_dropi(
  p_envio uuid,
  p_recibida integer,
  p_motivo text default null,
  p_usuario uuid default null
) returns void
language plpgsql as $$
declare
  v_envio record;
begin
  select * into v_envio from wms_envios_dropi where id = p_envio for update;
  if not found then raise exception 'El envío no existe.'; end if;
  if v_envio.estado <> 'en_camino' then
    raise exception 'Ese envío ya se marcó como recibido.';
  end if;
  if p_recibida is null or p_recibida < 0 then
    raise exception 'Escribe cuántas unidades dice Dropi que llegaron.';
  end if;
  if p_recibida <> v_envio.enviada and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Llegaron % de %: escribe el motivo de la diferencia.', p_recibida, v_envio.enviada;
  end if;
  update wms_envios_dropi
     set recibida = p_recibida, estado = 'recibido', motivo_diferencia = nullif(btrim(p_motivo), ''),
         recibido_por = p_usuario, recibido_en = now()
   where id = p_envio;
end;
$$;

-- Levantamiento: `p_items` es una lista de {sku, cantidad} y, para un producto con vencimiento, {sku, lotes: [{codigo,
-- vencimiento, cantidad}]}. Cada producto queda en lo contado: la diferencia con lo que había se anota como ajuste (o como
-- entrada si es un lote nuevo) con origen «conteo». En un producto con vencimiento, un lote que tenía unidades y no se nombró
-- queda en cero. Lo que no viene en la lista no se toca.
create or replace function wms_registrar_conteo(
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
  v_actual integer;
  v_contado integer;
  v_lote_id uuid;
  v_codigo text;
  v_venc date;
  v_nombrados uuid[];
  v_resto record;
  v_motivo text;
  v_productos integer := 0;
  v_ajustes integer := 0;
begin
  select tipo, activa into v_bodega from wms_bodegas where id = p_bodega;
  if not found then raise exception 'La bodega no existe.'; end if;
  if v_bodega.tipo <> 'propia' or not v_bodega.activa then
    raise exception 'El levantamiento se hace en una bodega propia y activa.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos contados.';
  end if;

  insert into wms_conteos (bodega_id, referencia, usuario_id) values (p_bodega, nullif(btrim(p_referencia), ''), p_usuario)
  returning id into v_conteo;
  v_motivo := 'Conteo físico' || coalesce(' · ' || nullif(btrim(p_referencia), ''), '');

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku := (v_item->>'sku')::uuid;
    select maneja_vencimiento, clase, tipo into v_maneja, v_clase, v_tipo from skus_maestros where id = v_sku;
    if not found then raise exception 'Un producto contado no existe.'; end if;
    if v_tipo = 'combo' or v_clase = 'test' then continue; end if;
    v_productos := v_productos + 1;

    if not v_maneja then
      v_contado := (v_item->>'cantidad')::integer;
      if v_contado is null or v_contado < 0 then raise exception 'Una cantidad contada no es válida.'; end if;
      select coalesce(fisico, 0) into v_actual from wms_stock where sku_maestro_id = v_sku and bodega_id = p_bodega;
      v_actual := coalesce(v_actual, 0);
      if v_contado <> v_actual then
        perform wms_registrar_movimiento(v_sku, p_bodega, 'ajuste', v_contado - v_actual, null, 'conteo', v_conteo::text, v_motivo, p_usuario);
        v_ajustes := v_ajustes + 1;
      end if;
    else
      v_nombrados := '{}';
      for v_lote in select * from jsonb_array_elements(coalesce(v_item->'lotes', '[]'::jsonb)) loop
        v_codigo := btrim(coalesce(v_lote->>'codigo', ''));
        v_contado := (v_lote->>'cantidad')::integer;
        v_venc := nullif(v_lote->>'vencimiento', '')::date;
        if v_codigo = '' then raise exception 'Falta el código de un lote.'; end if;
        if v_contado is null or v_contado < 0 then raise exception 'Una cantidad contada no es válida.'; end if;
        select id into v_lote_id from wms_lotes where sku_maestro_id = v_sku and lower(btrim(codigo)) = lower(v_codigo);
        if v_lote_id is null then
          if v_venc is null then raise exception 'El lote % es nuevo: indica su fecha de vencimiento.', v_codigo; end if;
          if v_contado > 0 then
            perform wms_registrar_movimiento(v_sku, p_bodega, 'entrada', v_contado, null, 'conteo', v_conteo::text, v_motivo, p_usuario, null, v_codigo, v_venc);
            v_ajustes := v_ajustes + 1;
            select id into v_lote_id from wms_lotes where sku_maestro_id = v_sku and lower(btrim(codigo)) = lower(v_codigo);
          end if;
        else
          if v_venc is not null and v_venc <> (select fecha_vencimiento from wms_lotes where id = v_lote_id) then
            raise exception 'El lote % ya existe con otra fecha de vencimiento.', v_codigo;
          end if;
          select coalesce(cantidad, 0) into v_actual from wms_stock_lote where lote_id = v_lote_id and bodega_id = p_bodega;
          v_actual := coalesce(v_actual, 0);
          if v_contado <> v_actual then
            perform wms_registrar_movimiento(v_sku, p_bodega, 'ajuste', v_contado - v_actual, null, 'conteo', v_conteo::text, v_motivo, p_usuario, v_lote_id);
            v_ajustes := v_ajustes + 1;
          end if;
        end if;
        if v_lote_id is not null then v_nombrados := v_nombrados || v_lote_id; end if;
      end loop;
      -- Lo que había en lotes que no se nombraron, queda en cero.
      for v_resto in
        select s.lote_id, s.cantidad from wms_stock_lote s join wms_lotes l on l.id = s.lote_id
         where l.sku_maestro_id = v_sku and s.bodega_id = p_bodega and s.cantidad <> 0 and not (s.lote_id = any (v_nombrados))
      loop
        perform wms_registrar_movimiento(v_sku, p_bodega, 'ajuste', -v_resto.cantidad, null, 'conteo', v_conteo::text, v_motivo, p_usuario, v_resto.lote_id);
        v_ajustes := v_ajustes + 1;
      end loop;
    end if;
  end loop;

  update wms_conteos set productos = v_productos, ajustes = v_ajustes where id = v_conteo;
  return jsonb_build_object('conteo', v_conteo, 'productos', v_productos, 'ajustes', v_ajustes);
end;
$$;

-- La ficha de un producto ya no lista las bodegas desactivadas (salvo que les quede stock).
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
  where b.pais_id = p_pais and (b.activa or coalesce(s.fisico, 0) <> 0)
  order by b.tipo, b.orden, b.nombre
$$;
