-- Reversa de la migración 0118: quita los permisos finos, los permisos propios de cada persona y el color de los roles.
-- Los permisos por módulo de cada rol (`permisos_rol`) no se tocan.
begin;
drop table if exists permisos_persona_afinados;
drop table if exists permisos_persona;
drop table if exists permisos_afinados;
alter table roles drop column if exists color;
commit;
