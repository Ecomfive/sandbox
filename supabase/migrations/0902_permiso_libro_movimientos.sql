-- Portal AF4 360°: módulo «Libro de movimientos» (/libro-movimientos, importar el Excel y ver los movimientos).
-- Lo recibe quien ya trabaja en Nómina y gastos, con su mismo solo lectura. Lo demás se da en Usuarios y roles.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'libro-movimientos', solo_lectura
from permisos_rol
where modulo = 'gastos'
on conflict (rol_id, modulo) do nothing;
