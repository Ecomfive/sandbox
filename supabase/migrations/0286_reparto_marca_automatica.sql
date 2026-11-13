-- La marca «sin repartir» se quita sola cuando el principal ya no tiene stock general (13 nov 2026, pedido de Jhokser: la Rodillera Cobrevida tenía todo en la talla S y el
-- principal en 0, pero seguía diciendo «Stock sin repartir»). Mientras la marca esté puesta, lo que sale de una variante se descuenta del principal (0273), así que dejarla con el
-- principal en 0 lo volvería a dejar en negativo.
--
--   * Un disparador en `wms_stock`: cuando el stock físico de un producto marcado queda en 0 en una bodega y ya no tiene unidades en ninguna otra, se quita la marca.
--   * Una limpieza de una sola vez para los que hoy ya están así (marcados y con el principal en 0).
--
-- No cambia nada si el principal todavía tiene stock general. Reversa: supabase/rollbacks/0286_rollback.sql

create or replace function wms_quitar_reparto_pendiente_en_cero() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from skus_maestros where id = new.sku_maestro_id and reparto_pendiente)
     and not exists (select 1 from wms_stock where sku_maestro_id = new.sku_maestro_id and fisico <> 0) then
    update skus_maestros set reparto_pendiente = false, reparto_pendiente_desde = null where id = new.sku_maestro_id;
  end if;
  return null;
end;
$$;

drop trigger if exists wms_stock_quitar_reparto_pendiente on wms_stock;
create trigger wms_stock_quitar_reparto_pendiente
  after insert or update of fisico on wms_stock
  for each row when (new.fisico = 0)
  execute function wms_quitar_reparto_pendiente_en_cero();

-- Los que hoy ya están marcados con el principal en 0.
update skus_maestros p
set reparto_pendiente = false, reparto_pendiente_desde = null
where p.reparto_pendiente
  and not exists (select 1 from wms_stock s where s.sku_maestro_id = p.id and s.fisico <> 0);
