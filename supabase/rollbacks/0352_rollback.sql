-- Reversa de 0352: devuelve «PACK/…» y «PACKS/…» a «COMBO/…» en los compuestos de un solo producto (con la actividad que dejó la migración como guía, solo los que cambió ella).
with hechos as (
  select h.entidad_id::uuid as id, h.antes ->> 'SKU' as viejo, h.despues ->> 'SKU' as nuevo
  from historial_auditoria h
  where h.accion = 'cambiar_sku_producto' and h.usuario_nombre = 'Sistema' and h.entidad = 'skus_maestros'
    and (h.antes ->> 'SKU') ilike 'COMBO/%' and ((h.despues ->> 'SKU') ilike 'PACK/%' or (h.despues ->> 'SKU') ilike 'PACKS/%')
)
update skus_maestros s set codigo = h.viejo
from hechos h
where s.id = h.id and s.codigo = h.nuevo
  and not exists (select 1 from skus_maestros x where x.id <> s.id and upper(btrim(x.codigo)) = upper(btrim(h.viejo)));
notify pgrst, 'reload schema';
