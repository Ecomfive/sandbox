-- Reversa de 0227 (origen de las publicaciones de Dropi).
drop function if exists dropi_creadas_por_resolver(uuid);
alter table dropi_publicaciones drop column if exists origen;
