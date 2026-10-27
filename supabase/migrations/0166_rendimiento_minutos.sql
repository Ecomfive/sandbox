-- Equipo › Rendimiento (pedido de Alcides, 27 oct 2026): medir la jornada de cada persona en el sistema (entrada, salida, tiempo
-- activo, pausas y qué hizo en cada hora). `LatidoPresencia` ya avisaba cada minuto que la persona tiene la app abierta (0042, solo
-- «visto por última vez»); ahora además anota un renglón por minuto en que la persona estaba usando el sistema (con mouse o teclado
-- en los últimos 5 minutos y la pestaña visible), con la página en que estaba. Lo que hizo sale de `historial_auditoria`.
-- Solo lo ven los administradores (módulo `rendimiento`, dado aquí a los roles que pueden modificar Usuarios y roles).
-- RLS sin políticas: solo el servidor la lee y la escribe. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0166_rollback.sql

create table if not exists actividad_minutos (
  usuario_id uuid not null references perfiles (id) on delete cascade,
  minuto timestamptz not null,
  ruta text not null check (char_length(ruta) between 1 and 200),
  primary key (usuario_id, minuto)
);
create index if not exists actividad_minutos_minuto_idx on actividad_minutos (minuto);
alter table actividad_minutos enable row level security;

-- El permiso: solo quien puede modificar Usuarios y roles (los administradores).
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'rendimiento', false
from permisos_rol
where modulo = 'usuarios' and solo_lectura = false
on conflict (rol_id, modulo) do nothing;
