-- Quién puede modificar el Inventario (26 nov 2026, pedido de Dinora: un mismo conteo se cargó dos veces). Quedan así:
--   · Administradores: todo.
--   · Dinora y Yanixia (en su país): a cargo del inventario (módulo `encargado-inventario`, por persona): todas las bodegas, transferir, recibir compras y pasar del límite con motivo.
--   · Yiletsi: modifica Inventario sin estar a cargo: solo la bodega de despacho, sin transferir. Las remisiones siguen como estaban.
--   · Los demás: solo lectura (se cambia el rol que no administra y cualquier permiso propio de edición).
-- Correr ANTES de publicar el cambio: sin ella, quien no es administrador queda limitado a la bodega de despacho. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0367_rollback.sql

-- Respaldo de lo que había, para la reversa.
create table if not exists permisos_inventario_respaldo_0367 (
  origen text not null check (origen in ('rol', 'persona')),
  id uuid not null,
  modulo text not null,
  solo_lectura boolean,
  nivel text,
  primary key (origen, id, modulo)
);
alter table permisos_inventario_respaldo_0367 enable row level security;

insert into permisos_inventario_respaldo_0367 (origen, id, modulo, solo_lectura)
select 'rol', rol_id, modulo, solo_lectura from permisos_rol where modulo = 'inventario'
on conflict do nothing;

insert into permisos_inventario_respaldo_0367 (origen, id, modulo, nivel)
select 'persona', p.id, m.modulo, pp.nivel
from perfiles p
cross join (values ('inventario'), ('encargado-inventario')) as m(modulo)
left join permisos_persona pp on pp.perfil_id = p.id and pp.modulo = m.modulo
on conflict do nothing;

-- A cargo del inventario.
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'encargado-inventario', 'edicion' from perfiles
where activo and (nombre ilike 'Dinora%' or nombre ilike 'Yanixia%')
on conflict (perfil_id, modulo) do update set nivel = 'edicion';

-- Quienes modifican Inventario sin ser administradores lo tienen como permiso propio.
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'inventario', 'edicion' from perfiles
where activo and (nombre ilike 'Dinora%' or nombre ilike 'Yanixia%' or nombre ilike 'Yiletsi%')
on conflict (perfil_id, modulo) do update set nivel = 'edicion';

-- Los roles que no administran (no modifican Usuarios y roles) quedan en solo lectura.
update permisos_rol pr set solo_lectura = true
where pr.modulo = 'inventario' and not pr.solo_lectura
  and not exists (select 1 from permisos_rol a where a.rol_id = pr.rol_id and a.modulo = 'usuarios' and not a.solo_lectura);

-- Y cualquier otro permiso propio de edición.
update permisos_persona pp set nivel = 'lectura'
from perfiles p
where p.id = pp.perfil_id and pp.modulo = 'inventario' and pp.nivel = 'edicion'
  and not (p.nombre ilike 'Dinora%' or p.nombre ilike 'Yanixia%' or p.nombre ilike 'Yiletsi%')
  and not exists (select 1 from permisos_rol a where a.rol_id = p.rol_id and a.modulo = 'usuarios' and not a.solo_lectura)
  and not exists (select 1 from permisos_persona u where u.perfil_id = p.id and u.modulo = 'usuarios' and u.nivel = 'edicion');

-- Cómo queda cada persona activa con acceso a Inventario (para revisarlo al correr).
select p.nombre as persona, r.nombre as rol,
  coalesce(pi.nivel, case when ri.modulo is null then 'ninguno' when ri.solo_lectura then 'lectura' else 'edicion' end) as inventario,
  case when pe.nivel = 'edicion' then 'sí' else '' end as a_cargo
from perfiles p
left join roles r on r.id = p.rol_id
left join permisos_rol ri on ri.rol_id = p.rol_id and ri.modulo = 'inventario'
left join permisos_persona pi on pi.perfil_id = p.id and pi.modulo = 'inventario'
left join permisos_persona pe on pe.perfil_id = p.id and pe.modulo = 'encargado-inventario'
where p.activo and (ri.modulo is not null or pi.modulo is not null)
order by inventario, p.nombre;
