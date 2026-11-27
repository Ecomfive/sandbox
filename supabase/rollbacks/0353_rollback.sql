-- Reversa de 0353: devuelve «PACK/…» a «PACKS/…» en los compuestos que cambió esa migración (según la actividad que dejó).
with hechos as (
  select distinct on (h.entidad_id) h.entidad_id::uuid as id, h.antes ->> 'SKU' as viejo, h.despues ->> 'SKU' as nuevo
  from historial_auditoria h
  where h.accion = 'cambiar_sku_producto' and h.usuario_nombre = 'Sistema' and h.entidad = 'skus_maestros'
    and (h.antes ->> 'SKU') ilike 'PACKS/%' and (h.despues ->> 'SKU') ilike 'PACK/%'
  order by h.entidad_id, h.creado_en desc
)
update skus_maestros s set codigo = h.viejo
from hechos h
where s.id = h.id and s.codigo = h.nuevo
  and not exists (select 1 from skus_maestros x where x.id <> s.id and upper(btrim(x.codigo)) = upper(btrim(h.viejo)));
notify pgrst, 'reload schema';
