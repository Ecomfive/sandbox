-- Portal del proveedor, fase 2 (plan en PORTAL-PROVEEDOR.md): la página de Ecomfive «Portal del proveedor», debajo de Compras.
--
-- Quien tiene Compras recibe el módulo nuevo con su mismo solo lectura; después se ajusta por rol en Usuarios y roles.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'portal-proveedor', solo_lectura from permisos_rol where modulo = 'compras'
on conflict (rol_id, modulo) do nothing;

-- A quién le suena la campana cuando el proveedor cambia algo (fase 3). Decidido el 21 oct 2026: Francis Aponte.
alter table proveedores add column if not exists notificar_a uuid references perfiles(id) on delete set null;
update proveedores set notificar_a = (select id from perfiles where lower(email) = 'contacto@ecomfive.io' and activo limit 1)
where nombre = 'Chin' and notificar_a is null;
