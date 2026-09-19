-- Modulo "Configuracion" restringido a Admin, y bandera para elegir que
-- plataformas aparecen en el boton "+ Crear" de Retiros (antes hardcodeado
-- a Dropi/EFFI en el codigo).

alter table pais_plataformas
  add column if not exists disponible_para_retiro boolean not null default false;

update pais_plataformas set disponible_para_retiro = true
where plataforma_id in (select id from plataformas where nombre in ('Dropi', 'EFFI'));

insert into permisos_rol (rol_id, modulo)
select id, 'configuracion' from roles where nombre = 'Admin'
on conflict (rol_id, modulo) do nothing;
