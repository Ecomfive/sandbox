-- Repartir el stock entre variantes fallaba con «21000: DELETE requires a WHERE clause» (19 nov 2026, probado con «Ver así» como Dinora y con el detalle técnico del error que dejó el PR #735). Supabase
-- trae una protección (pg_safeupdate) que rechaza un `DELETE` o `UPDATE` sin `WHERE`, y la función de reparto vaciaba su tabla temporal con `delete from _reparto;` (desde la 0273; las pruebas con
-- PGlite no tienen esa protección y por eso no se vio). Ahora la vacía con `truncate`, que la protección no revisa; todo lo demás es igual a la 0332. Cualquier reparto, parcial o completo, fallaba
-- por esto, no por permisos. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0335_rollback.sql (deja la función de la 0332, con el `delete` que falla; solo para deshacer).

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
  truncate _reparto;
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
