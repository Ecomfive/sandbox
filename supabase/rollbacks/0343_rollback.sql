-- Reversa de 0343_permiso_llegadas.sql: quita el permiso `llegadas` (la lista sigue abriéndose desde el aviso, como antes).
delete from permisos_persona where modulo = 'llegadas';
delete from permisos_rol where modulo = 'llegadas';
