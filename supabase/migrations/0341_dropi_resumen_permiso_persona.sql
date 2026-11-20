-- Pedidos Dropi › Resumen (0340): el permiso también para quien tiene Ventas por tienda como permiso propio (20 nov 2026).
-- La 0340 solo lo dio a los roles con Ventas por tienda (hoy solo CEO), pero María José, Alex y Hernán lo tienen en su ficha
-- (`permisos_persona`), así que no veían la pestaña. Se les da el mismo nivel (lectura o edición). Se puede correr dos veces.
-- Reversa: supabase/rollbacks/0341_rollback.sql.

insert into permisos_persona (perfil_id, modulo, nivel)
select pp.perfil_id, 'pedidos-dropi-resumen', pp.nivel
from permisos_persona pp
where pp.modulo = 'ventas-tiendas' and pp.nivel in ('lectura', 'edicion')
on conflict (perfil_id, modulo) do nothing;

-- Revisión (solo lee): con_resumen = con_ventas_tiendas (hoy 3).
select
  (select count(*) from permisos_persona where modulo = 'ventas-tiendas' and nivel in ('lectura', 'edicion')) as con_ventas_tiendas,
  (select count(*) from permisos_persona where modulo = 'pedidos-dropi-resumen') as con_resumen;
