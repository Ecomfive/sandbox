-- Packs: el SKU de varias unidades de un mismo producto empieza por PACK o PACKS (23 nov 2026, pedido de Jhokser; antes todos empezaban por COMBO).
--   * Un compuesto de UN solo producto con 2 unidades: «COMBO/CREMA/NIDA» → «PACK/CREMA/NIDA».
--   * Un compuesto de UN solo producto con 3 o más unidades: «COMBO/CREMA/NIDA» → «PACKS/CREMA/NIDA».
--   * Un combo de productos DISTINTOS («COMBO/A+B») no cambia, y tampoco lo que ya empieza por PACK.
-- El SKU no se copia en ninguna otra tabla propia (se comprobó antes de correrla: las fichas de Shopify y de Dropi enlazan por llave, no por el texto), así que solo cambia `skus_maestros.codigo`.
-- Si un SKU nuevo ya lo tuviera otro producto, ese pack se deja como estaba. Cada cambio queda en la actividad del producto («Cambió el SKU»). Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0352_rollback.sql.

with p as (
  select s.id, s.codigo as viejo, max(k.cantidad) as cant
  from skus_maestros s
  join sku_maestro_componentes k on k.combo_id = s.id
  where s.tipo = 'combo' and s.codigo ilike 'COMBO/%'
  group by s.id, s.codigo
  having count(*) = 1 and max(k.cantidad) >= 2
), n as (
  select p.id, p.viejo, case when p.cant = 2 then 'PACK/' else 'PACKS/' end || substr(p.viejo, 7) as nuevo from p
), libres as (
  select n.* from n
  where not exists (select 1 from skus_maestros x where x.id <> n.id and upper(btrim(x.codigo)) = upper(btrim(n.nuevo)))
    and (select count(*) from n n2 where upper(btrim(n2.nuevo)) = upper(btrim(n.nuevo))) = 1
), cambiados as (
  update skus_maestros s set codigo = l.nuevo
  from libres l
  where s.id = l.id
  returning s.id, l.viejo, s.codigo as nuevo
)
insert into historial_auditoria (usuario_nombre, accion, entidad, entidad_id, antes, despues)
select 'Sistema', 'cambiar_sku_producto', 'skus_maestros', c.id::text, jsonb_build_object('SKU', c.viejo), jsonb_build_object('SKU', c.nuevo)
from cambiados c;

notify pgrst, 'reload schema';
