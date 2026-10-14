-- Reversa de la migración 0103: devuelve «Fuente de datos» a quien tenía Drop Killer y quita los cinco módulos de Testing Lab.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'fuente-datos', solo_lectura from permisos_rol where modulo = 'drop-killer'
on conflict (rol_id, modulo) do nothing;

delete from permisos_rol where modulo in ('drop-killer', 'tu-winner', 'scraping-proveedores', 'seleccion-productos', 'creacion-ofertas');
