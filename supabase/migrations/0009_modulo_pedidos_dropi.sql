-- El modulo de pedidos Dropi ya existia como pagina "Pronto"; ahora que
-- tiene datos reales, se le da el permiso al rol Admin ya sembrado.
insert into permisos_rol (rol_id, modulo)
select id, 'pedidos-dropi' from roles where nombre = 'Admin';
