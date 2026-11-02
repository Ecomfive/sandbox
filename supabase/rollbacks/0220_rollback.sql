-- Reversa de 0220 (Gestión de IDs Drop): quita el permiso del módulo a todos los roles y a las personas con permisos propios.
delete from permisos_rol where modulo = 'publicaciones-drop';
delete from permisos_persona where modulo = 'publicaciones-drop';
