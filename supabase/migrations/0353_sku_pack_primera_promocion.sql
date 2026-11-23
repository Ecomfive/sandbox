-- SKU de packs, corrección (23 nov 2026, pedido de Jhokser): PACK es la PRIMERA promoción por cantidad de un producto y PACKS la segunda (otra cantidad del mismo producto), no «2 unidades / 3 o más» como
-- dejó la 0352. Los packs que son la única promoción de su producto (los 22 de 3 unidades) vuelven de «PACKS/…» a «PACK/…». Un producto con dos promociones conserva el PACKS de la segunda (hoy no hay ninguno).
-- Si el SKU «PACK/…» ya lo tuviera otro producto, ese pack se deja como estaba. Cada cambio queda en la actividad del producto. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0353_rollback.sql.

with p as (
  select s.id, s.codigo as viejo, k.componente_id
  from skus_maestros s
  join sku_maestro_componentes k on k.combo_id = s.id
  where s.tipo = 'combo' and s.codigo ilike 'PACKS/%'
    and (select count(*) from sku_maestro_componentes z where z.combo_id = s.id) = 1
), n as (
  select p.id, p.viejo, 'PACK/' || substr(p.viejo, 7) as nuevo
  from p
  -- Solo si ese producto no tiene otra promoción: entonces esta es la primera.
  where not exists (
    select 1 from sku_maestro_componentes o
    join skus_maestros c on c.id = o.combo_id and c.tipo = 'combo'
    where o.componente_id = p.componente_id and o.combo_id <> p.id
      and (select count(*) from sku_maestro_componentes z where z.combo_id = c.id) = 1
  )
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
