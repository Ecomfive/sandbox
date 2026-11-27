-- Pedidos de despacho (26 nov 2026, pedido de Dinora). Despacho hace una sola lista y el sistema la separa en un pedido por bodega, según dónde haya. Además, nada se mueve hasta que
-- Despacho confirma: inventario dice de qué bodega sale cada producto (puede repartirlo entre varias) y «Enviar»
-- solo lo anota; Despacho confirma producto por producto lo que llegó (y corrige la cantidad si hace falta) y «Recibir y transferir» hace un traslado por cada bodega, todo o nada.
-- Los pedidos ya enviados antes de este cambio (con su traslado hecho) quedan como estaban. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0368_rollback.sql

-- La bodega que le toca a cada pedido al pedirlo y, si una lista salió en varios pedidos, lo que los une.
alter table despacho_pedidos_inventario add column if not exists bodega_asignada_id uuid references wms_bodegas (id);
alter table despacho_pedidos_inventario add column if not exists solicitud_grupo uuid;

create table if not exists despacho_pedidos_inventario_envios (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references despacho_pedidos_inventario (id) on delete cascade,
  item_id uuid not null references despacho_pedidos_inventario_items (id) on delete cascade,
  bodega_id uuid not null references wms_bodegas (id),
  cantidad_enviada integer not null check (cantidad_enviada between 1 and 1000000),
  -- Lo que despacho confirma que llegó (null = sin confirmar).
  cantidad_recibida integer check (cantidad_recibida is null or cantidad_recibida between 0 and 1000000),
  nota text check (nota is null or length(nota) <= 300),
  confirmado_por uuid,
  confirmado_por_nombre text,
  confirmado_en timestamptz,
  traslado_id uuid references wms_traslados (id),
  unique (item_id, bodega_id)
);
create index if not exists despacho_pedidos_inventario_envios_pedido_idx on despacho_pedidos_inventario_envios (pedido_id);

-- Solo el servidor (clave de servicio) la lee y la escribe.
alter table despacho_pedidos_inventario_envios enable row level security;

-- Lo disponible de un producto en una bodega, bloqueando la fila. Si es una variante cuyo stock sigue como general en su principal, cuenta también ese.
create or replace function despacho_disponible(p_sku uuid, p_bodega uuid) returns integer
language plpgsql as $$
declare
  v_hay integer;
  v_padre uuid;
  v_general integer;
begin
  select disponible into v_hay from wms_stock where sku_maestro_id = p_sku and bodega_id = p_bodega for update;
  select p.id into v_padre from skus_maestros s join skus_maestros p on p.id = s.padre_id where s.id = p_sku and coalesce((to_jsonb(p) ->> 'reparto_pendiente')::boolean, false);
  if v_padre is not null then
    select disponible into v_general from wms_stock where sku_maestro_id = v_padre and bodega_id = p_bodega for update;
  end if;
  return coalesce(v_hay, 0) + greatest(coalesce(v_general, 0), 0);
end;
$$;

-- Despacho recibe un pedido ya confirmado: un traslado por cada bodega de origen hacia la de despacho, con lo confirmado. Todo o nada.
create or replace function despacho_recibir_pedido(p_pedido uuid, p_usuario uuid, p_nombre text) returns jsonb
language plpgsql as $$
declare
  p record;
  r record;
  v_hay integer;
  v_items jsonb;
  v_tr jsonb;
  v_numeros jsonb := '[]'::jsonb;
  v_unidades integer := 0;
begin
  select id, numero, estado, traslado_id, bodega_destino_id into p from despacho_pedidos_inventario where id = p_pedido for update;
  if not found then raise exception 'Ese pedido ya no existe.'; end if;
  if p.estado <> 'enviado' then raise exception 'Ese pedido no está enviado: recarga la página.'; end if;
  if p.traslado_id is not null or not exists (select 1 from despacho_pedidos_inventario_envios where pedido_id = p_pedido) then
    raise exception 'Ese pedido no tiene productos por confirmar: recarga la página.';
  end if;
  -- Nadie cambia una confirmación mientras se recibe.
  perform 1 from despacho_pedidos_inventario_envios where pedido_id = p_pedido order by id for update;
  if exists (select 1 from despacho_pedidos_inventario_envios where pedido_id = p_pedido and cantidad_recibida is null) then
    raise exception 'Faltan productos por confirmar.';
  end if;

  -- Ninguna bodega puede quedar en negativo.
  for r in
    select e.bodega_id, i.sku_id, sum(e.cantidad_recibida)::integer as cantidad, max(i.producto) as producto, max(b.nombre) as bodega
    from despacho_pedidos_inventario_envios e
    join despacho_pedidos_inventario_items i on i.id = e.item_id
    join wms_bodegas b on b.id = e.bodega_id
    where e.pedido_id = p_pedido
    group by e.bodega_id, i.sku_id
    having sum(e.cantidad_recibida) > 0
    order by e.bodega_id, i.sku_id
  loop
    v_hay := despacho_disponible(r.sku_id, r.bodega_id);
    if r.cantidad > v_hay then
      raise exception 'En % solo hay % de «%»: avisa a inventario para que lo revise.', r.bodega, v_hay, left(r.producto, 60);
    end if;
  end loop;

  for r in select distinct bodega_id from despacho_pedidos_inventario_envios where pedido_id = p_pedido and cantidad_recibida > 0 order by bodega_id loop
    select jsonb_agg(jsonb_build_object('sku', x.sku_id, 'cantidad', x.cantidad)), sum(x.cantidad) into v_items, v_hay
    from (
      select i.sku_id, sum(e.cantidad_recibida)::integer as cantidad
      from despacho_pedidos_inventario_envios e join despacho_pedidos_inventario_items i on i.id = e.item_id
      where e.pedido_id = p_pedido and e.bodega_id = r.bodega_id and e.cantidad_recibida > 0
      group by i.sku_id
    ) x;
    v_tr := wms_crear_traslado(r.bodega_id, p.bodega_destino_id, v_items, 'PED-' || lpad(p.numero::text, 4, '0') || ' · pedido de despacho', p_usuario, p_nombre);
    update despacho_pedidos_inventario_envios set traslado_id = (v_tr ->> 'id')::uuid where pedido_id = p_pedido and bodega_id = r.bodega_id and cantidad_recibida > 0;
    v_numeros := v_numeros || jsonb_build_object('id', v_tr ->> 'id', 'numero', (v_tr ->> 'numero')::integer);
    v_unidades := v_unidades + v_hay;
  end loop;

  update despacho_pedidos_inventario_items i
    set cantidad_entregada = coalesce((select sum(e.cantidad_recibida) from despacho_pedidos_inventario_envios e where e.item_id = i.id), 0)
    where i.pedido_id = p_pedido;
  update despacho_pedidos_inventario set estado = 'recibido', recibido_en = now(), recibido_por = p_usuario, recibido_por_nombre = p_nombre where id = p_pedido;
  return jsonb_build_object('numero', p.numero, 'traslados', v_numeros, 'unidades', v_unidades);
end;
$$;

-- Inventario deshace una recepción marcada por error: traslados de reversa (de despacho a cada bodega) y el pedido vuelve a «Enviado» con las confirmaciones, para corregirlas. Todo o nada.
create or replace function despacho_deshacer_recepcion(p_pedido uuid, p_usuario uuid, p_nombre text) returns jsonb
language plpgsql as $$
declare
  p record;
  r record;
  v_hay integer;
  v_items jsonb;
  v_tr jsonb;
  v_numeros jsonb := '[]'::jsonb;
begin
  select id, numero, estado, bodega_destino_id, archivado_en into p from despacho_pedidos_inventario where id = p_pedido for update;
  if not found then raise exception 'Ese pedido ya no existe.'; end if;
  if p.estado <> 'recibido' or p.archivado_en is not null then raise exception 'Ese pedido ya no está entregado (o está archivado): recarga la página.'; end if;
  if not exists (select 1 from despacho_pedidos_inventario_envios where pedido_id = p_pedido) then
    raise exception 'Ese pedido no tiene una recepción que deshacer.';
  end if;
  perform 1 from despacho_pedidos_inventario_envios where pedido_id = p_pedido order by id for update;

  -- Despacho tiene que tener todavía lo que recibió.
  for r in
    select i.sku_id, sum(e.cantidad_recibida)::integer as cantidad, max(i.producto) as producto
    from despacho_pedidos_inventario_envios e join despacho_pedidos_inventario_items i on i.id = e.item_id
    where e.pedido_id = p_pedido and e.traslado_id is not null
    group by i.sku_id order by i.sku_id
  loop
    v_hay := despacho_disponible(r.sku_id, p.bodega_destino_id);
    if r.cantidad > v_hay then
      raise exception 'Despacho ya no tiene lo que recibió de «%» (recibió %, hay %).', left(r.producto, 60), r.cantidad, v_hay;
    end if;
  end loop;

  for r in
    select distinct e.bodega_id, e.traslado_id, t.numero
    from despacho_pedidos_inventario_envios e join wms_traslados t on t.id = e.traslado_id
    where e.pedido_id = p_pedido
    order by t.numero
  loop
    select jsonb_agg(jsonb_build_object('sku', x.sku_id, 'cantidad', x.cantidad)) into v_items
    from (
      select i.sku_id, sum(e.cantidad_recibida)::integer as cantidad
      from despacho_pedidos_inventario_envios e join despacho_pedidos_inventario_items i on i.id = e.item_id
      where e.pedido_id = p_pedido and e.traslado_id = r.traslado_id
      group by i.sku_id
    ) x;
    v_tr := wms_crear_traslado(p.bodega_destino_id, r.bodega_id, v_items,
      'Reversa de TRA-' || lpad(r.numero::text, 4, '0') || ' · PED-' || lpad(p.numero::text, 4, '0') || ' (recepción deshecha)', p_usuario, p_nombre);
    v_numeros := v_numeros || jsonb_build_object('numero', (v_tr ->> 'numero')::integer);
  end loop;

  update despacho_pedidos_inventario_envios set traslado_id = null where pedido_id = p_pedido;
  update despacho_pedidos_inventario_items i
    set cantidad_entregada = coalesce((select sum(e.cantidad_enviada) from despacho_pedidos_inventario_envios e where e.item_id = i.id), 0)
    where i.pedido_id = p_pedido;
  update despacho_pedidos_inventario set estado = 'enviado', recibido_en = null, recibido_por = null, recibido_por_nombre = null where id = p_pedido;
  return jsonb_build_object('numero', p.numero, 'traslados', v_numeros);
end;
$$;

revoke all on function despacho_disponible(uuid, uuid) from public, anon, authenticated;
revoke all on function despacho_recibir_pedido(uuid, uuid, text) from public, anon, authenticated;
revoke all on function despacho_deshacer_recepcion(uuid, uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
