-- Compras: «06 - Llegada a Puerto» y «07 - En Bodega», con aviso a Logística y a Pagos (16 nov 2026, pedido de Hernán).
--
-- 1) Etapas: «Arribo Mercancía» (`arribo_mercancia`, la clave no cambia) pasa a llamarse «06 - Llegada a Puerto» (solo el nombre, en el código) y entra
--    «07 - En Bodega» (`en_bodega`); «Completado» pasa a ser la 08. Completado = la mercancía ya está en bodega y el segundo pago está hecho.
-- 2) Quién recibe cada aviso (`compras_avisos_destinatarios`): al pasar una compra a Llegada a Puerto le llega a Logística (el usuario de Dinora) la lista de lo
--    que viene (producto, unidades, cajas y etiqueta de las cajas); al pasar a En Bodega le llega a María José lo que hay que pagar del segundo pago. Se cambian
--    en Configuración › «Avisos de Compras».
-- 3) `compras_llegadas` + `compras_llegada_items`: cada llegada que se avisa (una por acción: un cambio suelto o un lote) con las compras que trae, y, en las de
--    bodega, el pago de cada una (fecha, monto y quién lo registró). Al registrar el pago la compra pasa a Completado.
-- 4) El portal de Shen Zhen ve «En Bodega» como «Llegado» (igual que Llegada a Puerto y Completado).
--
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0304_rollback.sql

-- 1) La etapa nueva en la lista de etapas válidas.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'wms_compras'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%etapa%cotizar%'
  loop
    execute format('alter table wms_compras drop constraint %I', r.conname);
  end loop;
end $$;

alter table wms_compras drop constraint if exists wms_compras_etapa_check;
alter table wms_compras add constraint wms_compras_etapa_check check (
  etapa in (
    'backlog', 'solicitud_local', 'solicitud_internacional', 'cotizar', 'enviado_cotizacion', 'cotizado',
    'evaluacion_proveedor', 'solicitud_proveedor', 'compra_pago', 'produccion', 'tracking',
    'aviso_logistica', 'arribo_mercancia', 'en_bodega', 'completado', 'descartado'
  )
);

-- 4) El espejo del portal: «En Bodega» también es «Llegado». Es la misma función de 0270 con una línea más.
create or replace function proveedor_sincronizar(p_compra uuid) returns void
language plpgsql as $$
declare
  c wms_compras%rowtype;
  v_prov proveedores%rowtype;
  v_etapa text;
  v_pais text;
  v_via text;
  v_modalidad text;
  v_costo numeric;
  v_items int;
  v_producto text;
  v_nombre_sku text;
begin
  select * into c from wms_compras where id = p_compra;
  if not found then return; end if;

  select * into v_prov from proveedores
  where activo and lower(btrim(nombre_en_compras)) = lower(btrim(coalesce(c.proveedor, '')));

  v_etapa := case c.etapa
    when 'enviado_cotizacion' then 'por_cotizar'
    when 'cotizado' then 'cotizado'
    when 'produccion' then 'produccion'
    when 'tracking' then 'enviado'
    when 'arribo_mercancia' then 'llegado'
    when 'en_bodega' then 'llegado'
    when 'completado' then 'llegado'
    when 'descartado' then 'descartado'
    else null
  end;

  -- No es del proveedor, todavía no se le envió a cotizar (01 - Cotizar o Backlog), está en una etapa retirada o se anuló: se oculta
  -- si ya estaba.
  if v_prov.id is null or v_etapa is null or c.anulada_en is not null or c.tipo <> 'pais' then
    update proveedor_pedidos set visible = false, actualizado_en = now() where compra_id = p_compra and visible;
    return;
  end if;

  select codigo into v_pais from paises where id = c.pais_id;
  -- Una sola vía en el portal: aéreo solo si es lo único que lleva; terrestre o sin vía cuentan como marítimo.
  v_via := case when coalesce(c.via_envio, '{}'::text[]) = array['aire']::text[] then 'aire' else 'mar' end;
  select modalidad into v_modalidad from wms_rutas_envio
  where activo and lower(btrim(agente)) = lower(btrim(v_prov.nombre_en_compras)) and pais_codigo = v_pais and via = v_via
  order by actualizado_en desc limit 1;
  -- Costo por unidad: el de su línea de producto si tiene una sola; si no, total ÷ unidades.
  select count(*), max(costo_unitario) into v_items, v_costo from wms_compra_items where compra_id = p_compra;
  if v_items <> 1 or v_costo is null then
    v_costo := case when coalesce(c.qty_total, 0) > 0 and c.monto_total is not null then round(c.monto_total / c.qty_total, 4) end;
  end if;

  -- El nombre que ve el proveedor: el de la compra, salvo que esté vacío o sea solo su código (ECOM01-0603): entonces el del
  -- producto vinculado en Compras (su primera línea).
  v_producto := nullif(btrim(c.nombre), '');
  if v_producto is null or lower(v_producto) = lower(btrim(coalesce(c.codigo, ''))) or v_producto ~* '^[a-z]+[0-9]*-[0-9]+$' then
    select s.nombre into v_nombre_sku
    from wms_compra_items i join skus_maestros s on s.id = i.sku_maestro_id
    where i.compra_id = p_compra
    order by i.creado_en
    limit 1;
    -- Sin producto vinculado, se queda con lo que tenía.
    v_producto := coalesce(nullif(btrim(v_nombre_sku), ''), v_producto);
  end if;

  insert into proveedor_pedidos as p (
    compra_id, proveedor_id, visible, referencia, producto, foto_referencia, pais_codigo, via, modalidad, etapa,
    unidades_pedidas, unidades, monto_total, costo_unitario, nota_para_proveedor, fecha_envio, fecha_llegada,
    primer_pago, fecha_pago_1, segundo_pago, fecha_pago_2, pagado_a_proveedor, prioridad, etapa_desde
  ) values (
    c.id, v_prov.id, true, c.codigo, coalesce(v_producto, 'Sin nombre'), c.foto_url, v_pais, v_via, v_modalidad, v_etapa,
    c.qty_total, c.qty_total, c.monto_total, v_costo, c.nota_proveedor, c.fecha_envio, c.fecha_llegada,
    c.primer_pago, c.fecha_pago_1, c.segundo_pago, c.fecha_pago_2, c.pagado_a_proveedor, c.prioridad, c.etapa_desde
  )
  on conflict (compra_id) do update set
    proveedor_id = excluded.proveedor_id,
    visible = true,
    referencia = excluded.referencia,
    producto = excluded.producto,
    foto_referencia = excluded.foto_referencia,
    pais_codigo = excluded.pais_codigo,
    via = excluded.via,
    modalidad = excluded.modalidad,
    etapa = excluded.etapa,
    -- Lo pedido sigue a la compra mientras está en «Por cotizar»; después queda fijo para ver si el proveedor cambió las unidades.
    unidades_pedidas = case when excluded.etapa = 'por_cotizar' or p.unidades_pedidas is null then excluded.unidades_pedidas else p.unidades_pedidas end,
    unidades = excluded.unidades,
    monto_total = excluded.monto_total,
    costo_unitario = excluded.costo_unitario,
    nota_para_proveedor = excluded.nota_para_proveedor,
    fecha_envio = excluded.fecha_envio,
    fecha_llegada = excluded.fecha_llegada,
    primer_pago = excluded.primer_pago,
    fecha_pago_1 = excluded.fecha_pago_1,
    segundo_pago = excluded.segundo_pago,
    fecha_pago_2 = excluded.fecha_pago_2,
    pagado_a_proveedor = excluded.pagado_a_proveedor,
    prioridad = excluded.prioridad,
    etapa_desde = excluded.etapa_desde,
    actualizado_en = now();
end;
$$;

-- 2) Quién recibe cada aviso. Sin políticas: solo el servidor la toca.
create table if not exists compras_avisos_destinatarios (
  id uuid primary key default uuid_v7(),
  evento text not null check (evento in ('llegada_puerto', 'llegada_bodega')),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  unique (evento, perfil_id)
);
alter table compras_avisos_destinatarios enable row level security;

-- Logística es el usuario de Dinora; los pagos, María José (si no está con ese nombre, se marca en Configuración › Avisos de Compras).
insert into compras_avisos_destinatarios (evento, perfil_id)
select 'llegada_puerto', p.id from perfiles p where p.nombre = 'Dinora Gomez' and p.activo
on conflict do nothing;
insert into compras_avisos_destinatarios (evento, perfil_id)
select 'llegada_bodega', p.id from perfiles p where p.nombre ilike 'Mar_a Jos_%' and p.activo
on conflict do nothing;

-- 3) Las llegadas avisadas y sus compras.
create table if not exists compras_llegadas (
  id uuid primary key default uuid_v7(),
  tipo text not null check (tipo in ('puerto', 'bodega')),
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists compras_llegadas_recientes on compras_llegadas (creado_en desc);
alter table compras_llegadas enable row level security;

create table if not exists compras_llegada_items (
  id uuid primary key default uuid_v7(),
  llegada_id uuid not null references compras_llegadas(id) on delete cascade,
  compra_id uuid not null references wms_compras(id) on delete cascade,
  -- Solo en las de bodega: el segundo pago ya hecho.
  pagado_en date,
  monto_pagado numeric(12, 2),
  pagado_por uuid references perfiles(id) on delete set null,
  pagado_por_nombre text,
  creado_en timestamptz not null default now(),
  unique (llegada_id, compra_id)
);
create index if not exists compras_llegada_items_compra on compras_llegada_items (compra_id);
alter table compras_llegada_items enable row level security;

-- El aviso «Para ti» de una llegada.
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check
  check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision', 'cierre', 'llegada'));

-- Vuelve a copiar al espejo lo que ya estaba.
select proveedor_sincronizar(compra_id) from proveedor_pedidos;

notify pgrst, 'reload schema';
