-- Permisos por accion (version simple): cada permiso de modulo puede marcarse como
-- "solo lectura", para que un rol vea una seccion sin poder crear/editar/cerrar nada ahi.

alter table permisos_rol add column if not exists solo_lectura boolean not null default false;
