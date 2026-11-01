-- Reversa de 0215_inventario_costa_rica.sql. Borra el corte de Dropi Costa Rica y deja la remisión solo para Dropi (como en la
-- 0214). Las bolsas y la bodega «Oficina» solo se borran si nada las usa; si no, la oficina se desactiva. «Despacho» y
-- «Fulfillment» de Costa Rica vuelven a activarse.
drop table if exists wms_cortes_externa;

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
  perform wms_registrar_movimiento(p_sku, p_desde, 'salida', p_cantidad, null, 'envio_dropi',
    coalesce(nullif(btrim(p_referencia), ''), 'Envío a Dropi'), 'Envío a Dropi (en camino)', p_usuario, p_lote);
  return v_envio;
end;
$$;
drop function if exists wms_enviar_a_externa(uuid, uuid, uuid, integer, uuid, text, uuid);

delete from skus_maestros m
 where m.codigo in ('BOLSAS/BURBUJAS/15X24', 'BOLSAS/BURBUJAS/25X30', 'BOLSAS/ROLLO/17X30', 'BOLSAS/ROLLO/25X35', 'BOLSAS/ROLLO/32X45', 'BOLSAS/ROLLO/38X52')
   and not exists (select 1 from wms_movimientos mv where mv.sku_maestro_id = m.id)
   and not exists (select 1 from wms_stock s where s.sku_maestro_id = m.id)
   and not exists (select 1 from wms_envios_dropi e where e.sku_maestro_id = m.id);

update wms_bodegas b set activa = true, actualizado_en = now()
  from paises p where p.id = b.pais_id and p.codigo = 'CR' and b.codigo in ('despacho', 'fulfillment');
update wms_bodegas b set activa = false, actualizado_en = now()
  from paises p where p.id = b.pais_id and p.codigo = 'CR' and b.codigo = 'oficina';
delete from wms_bodegas b using paises p
 where p.id = b.pais_id and p.codigo = 'CR' and b.codigo = 'oficina'
   and not exists (select 1 from wms_movimientos m where m.bodega_id = b.id)
   and not exists (select 1 from wms_stock s where s.bodega_id = b.id)
   and not exists (select 1 from wms_conteos c where c.bodega_id = b.id)
   and not exists (select 1 from wms_envios_dropi e where e.bodega_origen_id = b.id);
