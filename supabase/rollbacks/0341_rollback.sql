-- Reversa de 0341: quita el permiso propio del Resumen de Dropi que se copió de Ventas por tienda.
delete from permisos_persona pp
where pp.modulo = 'pedidos-dropi-resumen'
  and exists (select 1 from permisos_persona v where v.perfil_id = pp.perfil_id and v.modulo = 'ventas-tiendas');
