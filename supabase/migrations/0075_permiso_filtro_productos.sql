-- «Filtros» salió de Compras: ahora es «Filtro de productos» (/filtro-productos), en Marketing, con su propio permiso.
-- Quien tenía Compras conserva el acceso (con el mismo solo lectura); los datos siguen en wms_filtro_productos.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'filtro-productos', solo_lectura
from permisos_rol
where modulo = 'compras'
on conflict (rol_id, modulo) do nothing;
