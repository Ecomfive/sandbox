-- Compras y portal de Shen Zhen: plazos por etapa y prioridades (reunión con Alcides del 11 nov 2026; prototipo aprobado por Hernán).
--
-- 1) Etapa nueva «02 - Enviado a cotización» (`enviado_cotizacion`), entre «01 - Cotizar» y «Cotizado»: marca el momento en que Francis
--    le manda la compra al proveedor. Desde ahí corre el plazo del proveedor (cotizar en 48 h, nunca más de 5 días).
-- 2) `wms_compras.etapa_desde`: desde cuándo está cada compra en su etapa (lo pone solo un disparador al cambiar la etapa). Con eso
--    Compras y el portal miden el plazo de cada etapa. Las compras de antes toman la fecha de su último cambio a esa etapa (la
--    Actividad) o, si no hay, la de creación.
-- 3) El portal ve la prioridad (Urgente, Alta, Media = `normal`, Baja; la columna `prioridad` ya existía, migración 0076) y desde cuándo
--    está cada pedido en su etapa.
-- 4) El portal ya no muestra «01 - Cotizar»: Shen Zhen ve en «Por cotizar» solo lo que Ecomfive le envió (`enviado_cotizacion`). Las
--    compras que hoy están en «01 - Cotizar» y Shen Zhen ya ve en su portal pasan a «Enviado a cotización» (ya se las enviamos), con
--    su cambio en la Actividad; su plazo empieza a contar al correr esta migración.
--
-- La misma regla de etapas vive en `src/lib/proveedor/espejo.ts`; una prueba comprueba que las dos digan lo mismo. Se puede correr más
-- de una vez. Reversa: `supabase/rollbacks/0270_rollback.sql`.

-- 1) La etapa nueva en la lista de etapas válidas (se reemplaza la restricción de 0050, que sigue aceptando las etapas retiradas).
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

alter table wms_compras add constraint wms_compras_etapa_check check (
  etapa in (
    'backlog', 'solicitud_local', 'solicitud_internacional', 'cotizar', 'enviado_cotizacion', 'cotizado',
    'evaluacion_proveedor', 'solicitud_proveedor', 'compra_pago', 'produccion', 'tracking',
    'aviso_logistica', 'arribo_mercancia', 'completado', 'descartado'
  )
);

-- 2) Desde cuándo está cada compra en su etapa, y lo nuevo del espejo.
alter table wms_compras add column if not exists etapa_desde timestamptz;
alter table wms_compras alter column etapa_desde set default now();
alter table proveedor_pedidos add column if not exists prioridad text;
alter table proveedor_pedidos add column if not exists etapa_desde timestamptz;

-- 3) El espejo: «Enviado a cotización» es el «Por cotizar» del proveedor; «01 - Cotizar» ya no se le muestra. Copia también la prioridad
--    y desde cuándo está en su etapa. El resto es la misma función de 0150.
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

-- 4) El disparador que pone `etapa_desde`: al crear la compra y cada vez que cambia su etapa.
create or replace function wms_compras_etapa_desde() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.etapa_desde := coalesce(new.etapa_desde, now());
  elsif new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
  end if;
  return new;
end;
$$;

drop trigger if exists wms_compras_etapa_desde on wms_compras;
create trigger wms_compras_etapa_desde before insert or update of etapa on wms_compras
for each row execute function wms_compras_etapa_desde();

-- 5) Lo que Shen Zhen ya tiene en «Por cotizar» de su portal (compras en 01 - Cotizar) ya se le envió: pasa a «Enviado a cotización».
--    Va antes de llenar `etapa_desde`: al llenarla se vuelve a copiar cada compra y las de «01 - Cotizar» se ocultan del portal.
with movidas as (
  update wms_compras c
     set etapa = 'enviado_cotizacion', actualizado_en = now()
   where c.etapa = 'cotizar'
     and exists (select 1 from proveedor_pedidos p where p.compra_id = c.id and p.visible and p.etapa = 'por_cotizar')
  returning c.id
)
insert into wms_compra_eventos (compra_id, campo, valor_antes, valor_despues, autor, origen)
select id, 'etapa', 'cotizar', 'enviado_cotizacion', 'Migración 0270', 'sistema' from movidas;

-- 6) Las compras de antes: desde su último cambio a la etapa en que están (la Actividad) o, si no hay, desde que se crearon.
update wms_compras c
   set etapa_desde = coalesce(
     (select max(e.ocurrido_en) from wms_compra_eventos e where e.compra_id = c.id and e.campo = 'etapa' and e.valor_despues = c.etapa),
     c.creado_en
   )
 where c.etapa_desde is null;

-- 7) Vuelve a copiar al espejo todo lo que ya estaba, con la prioridad y desde cuándo está en su etapa.
select proveedor_sincronizar(compra_id) from proveedor_pedidos;
