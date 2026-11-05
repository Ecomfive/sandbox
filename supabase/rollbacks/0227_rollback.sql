-- Reversa de 0227 (Uso del sistema). La función `dropi_creadas_por_resolver` de la 0226 no se restaura: ya nada la usa.
delete from permisos_persona where modulo = 'uso-sistema';
drop table if exists uso_sistema_motivos;
