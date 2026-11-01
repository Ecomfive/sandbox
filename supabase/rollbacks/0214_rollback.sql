-- Reversa de 0214_inventario_manual_panama.sql. Borra los levantamientos y los envíos a Dropi registrados (el libro de
-- movimientos no se toca: lo que movieron queda en el stock). Devuelve las bodegas de Panamá como estaban, salvo las nuevas que
-- ya tengan movimientos (esas se desactivan en vez de borrarse).
drop function if exists wms_registrar_conteo(uuid, jsonb, text, uuid);
drop function if exists wms_recibir_envio_dropi(uuid, integer, text, uuid);
drop function if exists wms_enviar_a_dropi(uuid, uuid, integer, uuid, text, uuid);
drop function if exists wms_transferir(uuid, uuid, uuid, integer, uuid, text, text, uuid);
drop function if exists wms_revisar_bodegas_transferencia(uuid, uuid);
drop table if exists wms_envios_dropi;
drop table if exists wms_conteos;

update wms_bodegas b set nombre = 'Deposito Plaza 100', actualizado_en = now()
  from paises p where p.id = b.pais_id and p.codigo = 'PA' and b.codigo = 'fulfillment';
update wms_bodegas b set activa = true, actualizado_en = now()
  from paises p where p.id = b.pais_id and p.codigo = 'PA'
   and (b.codigo in ('effi', 'boxfull', 'dunamixfy') or (b.codigo is null and b.nombre = 'Deposito Principal'));
update wms_bodegas b set activa = false, actualizado_en = now()
  from paises p where p.id = b.pais_id and p.codigo = 'PA' and b.codigo in ('oficina_ancon', 'istorage');
delete from wms_bodegas b using paises p
 where p.id = b.pais_id and p.codigo = 'PA' and b.codigo in ('oficina_ancon', 'istorage')
   and not exists (select 1 from wms_movimientos m where m.bodega_id = b.id)
   and not exists (select 1 from wms_stock s where s.bodega_id = b.id)
   and not exists (select 1 from wms_ubicaciones u where u.bodega_id = b.id);

-- Los movimientos con los orígenes nuevos se quedan: la restricción vieja solo se vuelve a poner si no hay ninguno.
do $$
begin
  if not exists (select 1 from wms_movimientos where origen in ('transferencia', 'envio_dropi')) then
    alter table wms_movimientos drop constraint if exists wms_movimientos_origen_check;
    alter table wms_movimientos add constraint wms_movimientos_origen_check
      check (origen in ('manual', 'sync_dropi', 'sync_shopify', 'pedido', 'conteo'));
  end if;
end $$;

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
