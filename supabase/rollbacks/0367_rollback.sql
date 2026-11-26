-- Reversa de 0367: devuelve los permisos de Inventario como estaban antes (los guardó la migración) y borra el respaldo.
update permisos_rol pr set solo_lectura = r.solo_lectura
from permisos_inventario_respaldo_0367 r
where r.origen = 'rol' and r.id = pr.rol_id and r.modulo = pr.modulo;

-- Los permisos propios que no existían se quitan; los que sí, vuelven a su nivel.
delete from permisos_persona pp
using permisos_inventario_respaldo_0367 r
where r.origen = 'persona' and r.id = pp.perfil_id and r.modulo = pp.modulo and r.nivel is null;

update permisos_persona pp set nivel = r.nivel
from permisos_inventario_respaldo_0367 r
where r.origen = 'persona' and r.id = pp.perfil_id and r.modulo = pp.modulo and r.nivel is not null;

drop table if exists permisos_inventario_respaldo_0367;
