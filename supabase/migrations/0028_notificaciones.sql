-- Centro de notificaciones: modulo nuevo (Por corregir / Bitacora / Sincronizacion con Dropi)
-- y tabla para que el script local que mantiene viva la sesion de Dropi reporte su ultimo
-- resultado (en vez de que solo quede en un log de texto en la maquina local).

create table if not exists dropi_sesiones (
  pais_codigo text not null,
  tipo text not null check (tipo in ('proveedor', 'dropshipper')),
  renovada_en timestamptz not null default now(),
  ok boolean not null,
  mensaje text,
  primary key (pais_codigo, tipo)
);

alter table dropi_sesiones enable row level security;

create policy "dropi_sesiones autenticados" on dropi_sesiones
  for all using (auth.role() = 'authenticated');

insert into permisos_rol (rol_id, modulo)
select id, 'notificaciones' from roles where nombre = 'Admin'
on conflict (rol_id, modulo) do nothing;
