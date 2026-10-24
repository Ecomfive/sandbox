-- Portal del proveedor: el nombre de cada pedido (24 oct 2026, pedido de Hernán). Algunas compras nuevas se llaman solo con su código
-- (ECOM01-0603) y el portal mostraba eso. Ahora, si el nombre de la compra está vacío o es solo su código, el portal usa el nombre del
-- producto vinculado en Compras (su primera línea). Las compras con nombre siguen igual. La misma función de 0124, solo cambia el nombre.
-- Se puede correr más de una vez.

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
    when 'cotizar' then 'por_cotizar'
    when 'cotizado' then 'cotizado'
    when 'produccion' then 'produccion'
    when 'tracking' then 'enviado'
    when 'arribo_mercancia' then 'llegado'
    when 'completado' then 'llegado'
    when 'descartado' then 'descartado'
    else null
  end;

  -- No es del proveedor, está en Backlog (o en una etapa retirada) o se anuló: se oculta si ya estaba.
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
    primer_pago, fecha_pago_1, segundo_pago, fecha_pago_2, pagado_a_proveedor
  ) values (
    c.id, v_prov.id, true, c.codigo, coalesce(v_producto, 'Sin nombre'), c.foto_url, v_pais, v_via, v_modalidad, v_etapa,
    c.qty_total, c.qty_total, c.monto_total, v_costo, c.nota_proveedor, c.fecha_envio, c.fecha_llegada,
    c.primer_pago, c.fecha_pago_1, c.segundo_pago, c.fecha_pago_2, c.pagado_a_proveedor
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
    actualizado_en = now();
end;
$$;

-- Vuelve a copiar al espejo las compras que ya están en el portal, para que tomen el nombre nuevo.
select proveedor_sincronizar(compra_id) from proveedor_pedidos;
