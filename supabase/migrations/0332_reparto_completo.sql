-- Repartir TODO el stock general que queda (o el de la última bodega) fallaba con «No se pudo hacer el reparto» (19 nov 2026, pedido de Jhokser: Dinora no podía repartir las dos bodegas del Mini
-- ventilador a la vez, y Hernán sí podía repartir solo una). La causa, en tres piezas que se pisaban:
--   1. `wms_registrar_movimiento` primero cambia el stock (`wms_aplicar_cambios`) y después guarda el movimiento en el libro.
--   2. Cuando la última salida del reparto deja al principal en 0, el disparador de la 0286 le quita la marca «pendiente de repartir» **en ese mismo instante**.
--   3. El disparador `wms_movimientos_sin_padre` (0078/0273) rechaza guardar en el libro un movimiento de un producto con variantes que ya no está pendiente: «Este producto tiene variantes…».
-- Como el reparto parcial (una bodega, o parte de una) deja stock en el principal, nunca llegaba a 0 y funcionaba; repartir todo sí. Ahora:
--   * `wms_movimientos_sin_padre` deja pasar los movimientos de origen `reparto` (los que hacen `wms_repartir_stock_variantes` y `wms_dejar_reparto_pendiente`).
--   * El disparador de la 0286 no quita la marca mientras corre un reparto (`wms.repartiendo`, local a la transacción): la quita la función al terminar, como ya hacía cuando no queda nada.
--   * `wms_repartir_stock_variantes` (la de la 0296) activa esa señal al empezar y la apaga antes de la cuenta final.
-- No cambia nada fuera de un reparto. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0332_rollback.sql

create or replace function wms_movimientos_sin_padre() returns trigger language plpgsql as $$
begin
  if new.origen <> 'reparto'
     and exists (select 1 from skus_maestros where padre_id = new.sku_maestro_id)
     and not exists (select 1 from skus_maestros where id = new.sku_maestro_id and reparto_pendiente) then
    raise exception 'Este producto tiene variantes: el inventario se mueve en cada variante.';
  end if;
  return new;
end;
$$;

create or replace function wms_quitar_reparto_pendiente_en_cero() returns trigger
language plpgsql as $$
begin
  -- Dentro de un reparto, la función de reparto quita la marca al terminar.
  if coalesce(current_setting('wms.repartiendo', true), '') = 'on' then
    return null;
  end if;
  if exists (select 1 from skus_maestros where id = new.sku_maestro_id and reparto_pendiente)
     and not exists (select 1 from wms_stock where sku_maestro_id = new.sku_maestro_id and fisico <> 0) then
    update skus_maestros set reparto_pendiente = false, reparto_pendiente_desde = null where id = new.sku_maestro_id;
  end if;
  return null;
end;
$$;

create or replace function wms_repartir_stock_variantes(p_padre uuid, p_reparto jsonb, p_usuario uuid default null)
returns jsonb
language plpgsql
as $$
declare
  p skus_maestros%rowtype;
  fila record;
  b record;
  suma integer;
  repartidas integer := 0;
begin
  select * into p from skus_maestros where id = p_padre for update;
  if not found then raise exception 'El producto no existe.'; end if;
  if not p.reparto_pendiente then raise exception 'Este producto no tiene stock pendiente de repartir.'; end if;
  if p_reparto is null or jsonb_typeof(p_reparto) <> 'array' then raise exception 'El reparto no es válido.'; end if;
  -- Mientras dura el reparto, el disparador de la 0286 no quita la marca: la quita esta función al final, cuando ya terminó de mover todo (ver la nota de arriba).
  perform set_config('wms.repartiendo', 'on', true);

  create temporary table if not exists _reparto (variante uuid, bodega uuid, cantidad integer) on commit drop;
  delete from _reparto;
  for fila in select * from jsonb_to_recordset(p_reparto) as x(variante uuid, bodega uuid, cantidad integer) loop
    if fila.variante is null or fila.bodega is null or fila.cantidad is null or fila.cantidad < 0 then
      raise exception 'El reparto no es válido: cada línea lleva variante, bodega y una cantidad de 0 o más.';
    end if;
    if not exists (select 1 from skus_maestros where id = fila.variante and padre_id = p_padre) then
      raise exception 'Una de las variantes del reparto no es de este producto.';
    end if;
    if not exists (select 1 from wms_bodegas where id = fila.bodega and tipo = 'propia') then
      raise exception 'Una de las bodegas del reparto no existe o no es propia.';
    end if;
    insert into _reparto values (fila.variante, fila.bodega, fila.cantidad);
  end loop;

  if exists (select 1 from wms_stock where sku_maestro_id = p_padre and (reservado <> 0 or danado <> 0 or inspeccion <> 0 or retenido <> 0)) then
    raise exception 'El stock general tiene unidades reservadas, dañadas, en inspección o retenidas: resuélvelo antes de repartir.';
  end if;
  if exists (select 1 from wms_stock_ubicacion where sku_maestro_id = p_padre and cantidad <> 0) then
    raise exception 'El stock general está por ubicación: no se puede repartir desde aquí.';
  end if;

  -- En cada bodega mencionada se puede repartir hasta lo que hay; lo que no se reparte sigue como stock general.
  for b in
    select bodega, coalesce(sum(cantidad), 0)::integer as repartido,
      coalesce((select s.fisico from wms_stock s where s.sku_maestro_id = p_padre and s.bodega_id = r.bodega), 0) as general
    from _reparto r group by bodega
  loop
    if b.repartido > 0 and b.general < 0 then
      raise exception 'El stock general de % está en negativo (%): corrígelo con un ajuste antes de repartir.', (select nombre from wms_bodegas where id = b.bodega), b.general;
    end if;
    if b.repartido > b.general then
      raise exception 'En % se pueden repartir como máximo % unidades y se repartieron %.', (select nombre from wms_bodegas where id = b.bodega), b.general, b.repartido;
    end if;
  end loop;

  for fila in select variante, bodega, cantidad from _reparto where cantidad > 0 order by bodega, variante loop
    perform wms_registrar_movimiento(p_padre, fila.bodega, 'salida', fila.cantidad, null, 'reparto', 'Reparto entre variantes', null, p_usuario);
    perform wms_registrar_movimiento(fila.variante, fila.bodega, 'entrada', fila.cantidad, null, 'reparto', 'Reparto del stock general', null, p_usuario);
    repartidas := repartidas + fila.cantidad;
  end loop;

  -- Lo que queda como stock general; la marca solo se quita cuando ya no queda nada en ninguna bodega.
  perform set_config('wms.repartiendo', 'off', true);
  select coalesce(sum(abs(fisico)), 0) into suma from wms_stock where sku_maestro_id = p_padre;
  if suma = 0 then
    update skus_maestros set reparto_pendiente = false, reparto_pendiente_desde = null where id = p_padre;
  end if;

  return jsonb_build_object('repartidas', repartidas, 'queda', suma, 'pendiente', suma <> 0);
end;
$$;

revoke all on function wms_repartir_stock_variantes(uuid, jsonb, uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
