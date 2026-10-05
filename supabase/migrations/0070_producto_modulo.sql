-- Módulo «Producto»: el SKU maestro pasa a ser el producto, que se crea en su propio módulo (sustituye al Catálogo maestro).
--
-- * clase: un producto es `fisico` (ya lo compramos) o `test` (lo estamos probando y todavía no se compra). Un producto de
--   prueba aparece en el inventario pero NO tiene stock: no recibe movimientos hasta que se marca como físico.
-- * Se acaba el flujo propuesto → en revisión → aprobado: todo producto queda `aprobado` (la columna se conserva).
-- * El código (SKU) es la llave con la que una venta de cualquier plataforma (Dropi, las tiendas de Shopify) encuentra su
--   producto para descontar el inventario: tiene que ser único sin importar mayúsculas ni espacios.
-- * wms_aplicar_venta: dado el código de un SKU, aplica a las bodegas la reserva, la liberación o el despacho de una venta; si el
--   SKU es compuesto, lo reparte entre sus componentes (cada uno descuenta su cantidad). Es la base del descuento automático;
--   todavía no está conectada a ninguna plataforma.
-- * El módulo de permisos `catalogo-maestro` pasa a llamarse `producto`: quien tenía el uno recibe el otro.

alter table skus_maestros add column if not exists clase text not null default 'fisico' check (clase in ('fisico', 'test'));
update skus_maestros set estado = 'aprobado' where estado <> 'aprobado';
alter table skus_maestros alter column estado set default 'aprobado';
create unique index if not exists skus_maestros_codigo_unico on skus_maestros (lower(btrim(codigo)));

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'producto', solo_lectura from permisos_rol where modulo = 'catalogo-maestro'
on conflict (rol_id, modulo) do nothing;
insert into permisos_rol (rol_id, modulo)
select r.id, 'producto' from roles r
where r.nombre = 'Admin' and not exists (select 1 from permisos_rol p where p.rol_id = r.id and p.modulo = 'producto');

-- Un producto de prueba no tiene stock: ningún movimiento (a mano, de una sincronización ni de una venta) lo toca.
create or replace function wms_aplicar_cambios(p_sku uuid, p_bodega uuid, p_cambios jsonb) returns void
language plpgsql as $$
begin
  if exists (select 1 from skus_maestros where id = p_sku and clase = 'test') then
    raise exception 'Es un producto de prueba: no tiene stock hasta que se marque como físico.';
  end if;
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

-- El resumen del inventario ahora trae la clase (físico o test) de cada producto.
drop function if exists wms_stock_resumen(uuid, uuid);
create or replace function wms_stock_resumen(p_pais uuid, p_bodega uuid default null)
returns table (
  sku_maestro_id uuid, codigo text, nombre text, tipo text, clase text,
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
  select m.id, m.codigo, m.nombre, m.tipo, m.clase,
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

-- Aplica una venta a las bodegas buscando el producto por su CÓDIGO (el mismo SKU en Dropi y en las tiendas de Shopify):
--   fase 'reserva'    → al crear el pedido: sube lo reservado.
--   fase 'liberacion' → pedido cancelado: baja lo reservado.
--   fase 'despacho'   → al despachar: baja el físico y suelta la reserva.
-- Un SKU compuesto se reparte entre sus componentes (cada uno por su cantidad × `p_cantidad`). Devuelve cuántos movimientos
-- dejó en el libro. Si el código no existe, o el producto es de prueba, falla y no cambia nada.
create or replace function wms_aplicar_venta(
  p_codigo text,
  p_cantidad integer,
  p_bodega uuid,
  p_fase text,
  p_origen text default 'pedido',
  p_referencia text default null,
  p_usuario uuid default null
) returns integer
language plpgsql as $$
declare
  v_sku record;
  v_comp record;
  v_movimientos integer := 0;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad de la venta debe ser positiva.';
  end if;
  if p_fase not in ('reserva', 'liberacion', 'despacho') then
    raise exception 'Fase de venta no válida: %.', p_fase;
  end if;
  select id, codigo, tipo, clase into v_sku from skus_maestros where lower(btrim(codigo)) = lower(btrim(p_codigo));
  if not found then
    raise exception 'No hay un producto con el SKU %.', p_codigo;
  end if;

  for v_comp in
    select v_sku.id as sku_id, 1 as cantidad where v_sku.tipo <> 'combo'
    union all
    select c.componente_id, c.cantidad from sku_maestro_componentes c where v_sku.tipo = 'combo' and c.combo_id = v_sku.id
  loop
    if p_fase = 'reserva' then
      perform wms_registrar_movimiento(v_comp.sku_id, p_bodega, 'reserva', v_comp.cantidad * p_cantidad, null, p_origen, p_referencia, null, p_usuario);
      v_movimientos := v_movimientos + 1;
    elsif p_fase = 'liberacion' then
      perform wms_registrar_movimiento(v_comp.sku_id, p_bodega, 'liberacion', v_comp.cantidad * p_cantidad, null, p_origen, p_referencia, null, p_usuario);
      v_movimientos := v_movimientos + 1;
    else
      perform wms_registrar_movimiento(v_comp.sku_id, p_bodega, 'liberacion', v_comp.cantidad * p_cantidad, null, p_origen, p_referencia, null, p_usuario);
      perform wms_registrar_movimiento(v_comp.sku_id, p_bodega, 'salida', v_comp.cantidad * p_cantidad, null, p_origen, p_referencia, null, p_usuario);
      v_movimientos := v_movimientos + 2;
    end if;
  end loop;
  if v_movimientos = 0 then
    raise exception 'El SKU compuesto % no tiene componentes.', p_codigo;
  end if;
  return v_movimientos;
end;
$$;
