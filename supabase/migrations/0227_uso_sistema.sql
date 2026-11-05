-- Gestión de IDs Dropi › Uso del sistema (5 nov 2026, pedido de Alcides y Hernán). Saber qué se sigue haciendo en Dropi y por qué, para pasarlo al
-- sistema. Es de supervisión: solo Hernán y Alcides. Quien gestiona los IDs no ve nada, así que se quita el pendiente de «Hoy» que traía la 0226.
drop function if exists dropi_creadas_por_resolver(uuid);

-- Por qué se hizo en Dropi. Lo anota quien supervisa; el resumen de motivos es la lista de lo que hay que arreglar en el sistema.
create table if not exists uso_sistema_motivos (
  publicacion_id uuid primary key references dropi_publicaciones(id) on delete cascade,
  motivo text not null check (motivo in ('falta_dato', 'no_permite', 'mas_rapido', 'no_sabia', 'fallo', 'otro')),
  nota text,
  actualizado_por uuid references perfiles(id) on delete set null,
  actualizado_por_nombre text,
  actualizado_en timestamptz not null default now()
);
alter table uso_sistema_motivos enable row level security;

-- Un permiso de persona, no de rol: el rol Admin también lo tienen otras personas.
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'uso-sistema', 'edicion' from perfiles
where id in ('ffe79fe4-bb46-4522-b35a-7b3005719d58', 'a3e6cde5-006a-42a6-91df-db2ac88dffbb')
on conflict (perfil_id, modulo) do nothing;
