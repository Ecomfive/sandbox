-- Portal AF4 360°: permiso del «Panel financiero» (/panel-financiero), la vista de CFO que junta resultados, caja,
-- carteras, nómina y activo fijo. Cada bloque del panel solo se muestra si la persona puede abrir su módulo, así que el
-- permiso del panel no destapa nada nuevo. Lo recibe quien ya tiene «Estado de resultados». Se puede correr dos veces.

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'panel-financiero', true
from permisos_rol
where modulo = 'estado-resultados'
on conflict (rol_id, modulo) do nothing;
