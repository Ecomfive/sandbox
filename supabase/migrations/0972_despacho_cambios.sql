-- Gestión de tienda › Cambios y reembolsos (16 nov 2026, pedido de Hernán: pasar el tablero de Monday «CAMBIOS Y REEMBOLSOS PANAMA» al sistema, «que
-- funcione igual que Monday para que no tengan que aprender de nuevo»). Prototipo aprobado: https://claude.ai/artifact/XqT8vz5u2AGF5xSoSUfq41
--
-- Hasta hoy la tarea `monday` copiaba ese tablero a `mon_postventa` (migración 0290), que leen la ficha del pedido, Pedidos y Logística. Ahora las
-- solicitudes se llevan en el sistema, en esa MISMA tabla, con las columnas de Monday que faltaban:
--   * Responsable (una persona, como en Monday: `responsable_id`; lo que viene de Monday queda en `responsable_texto`), Fecha, Seguimiento, Valor de
--     envío, Valor reembolso, Adjunto (`adjuntos`), Notificar al cliente y Fecha notificación; quién paga el envío y el texto de la solicitud.
--   * Una solicitud creada en el sistema lleva `item_id` «S» + 32 cifras hexadecimales; una editada en el sistema queda con `editado_en` y la lectura de
--     Monday ya no la pisa. `despacho_item_id`: la fila de Despacho ciudad que la lleva (al entregarse, la solicitud pasa a Hecho).
--   * `postventa_notas` (las actualizaciones, también las de Monday, sin datos personales) y `postventa_actividad` (quién cambió qué).
--   * `postventa_cuentas`: los datos para hacer el reembolso (la columna «Cuenta Reembolso» de Monday). Solo la ve quien tiene el permiso
--     «despacho-cambios-cuentas»; se borra sola cuando la solicitud pasa a Hecho.
--   * El bucket privado `postventa-adjuntos` (fotos y PDF, 10 MB).
--
-- Solo el servidor lee y escribe (RLS sin políticas). Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0972_rollback.sql

alter table mon_postventa drop constraint if exists mon_postventa_item_id_check;
alter table mon_postventa add constraint mon_postventa_item_id_check check (item_id ~ '^([0-9]{1,20}|S[0-9a-f]{32})$');

alter table mon_postventa add column if not exists responsable_id uuid references perfiles(id) on delete set null;
alter table mon_postventa add column if not exists responsable_texto text check (responsable_texto is null or length(responsable_texto) <= 120);
alter table mon_postventa add column if not exists fecha date;
alter table mon_postventa add column if not exists seguimiento text check (seguimiento is null or length(seguimiento) <= 300);
alter table mon_postventa add column if not exists valor_envio numeric(12, 2) check (valor_envio is null or valor_envio >= 0);
alter table mon_postventa add column if not exists envio_paga text check (envio_paga is null or envio_paga in ('empresa', 'cliente'));
alter table mon_postventa add column if not exists adjuntos text[] not null default '{}';
alter table mon_postventa add column if not exists notificar text check (notificar is null or length(notificar) <= 60);
alter table mon_postventa add column if not exists fecha_notificacion date;
alter table mon_postventa add column if not exists solicitud text check (solicitud is null or length(solicitud) <= 3000);
alter table mon_postventa add column if not exists despacho_item_id text references mon_despachos(item_id) on delete set null;
alter table mon_postventa add column if not exists origen text not null default 'monday';
alter table mon_postventa drop constraint if exists mon_postventa_origen_check;
alter table mon_postventa add constraint mon_postventa_origen_check check (origen in ('monday', 'sistema'));
alter table mon_postventa add column if not exists creado_por uuid references perfiles(id) on delete set null;
alter table mon_postventa add column if not exists editado_en timestamptz;
alter table mon_postventa add column if not exists editado_por uuid references perfiles(id) on delete set null;
alter table mon_postventa add column if not exists archivado_en timestamptz;
alter table mon_postventa add column if not exists archivado_por uuid references perfiles(id) on delete set null;

create index if not exists mon_postventa_grupo on mon_postventa (grupo, creado_monday desc) where archivado_en is null;
create index if not exists mon_postventa_despacho on mon_postventa (despacho_item_id) where despacho_item_id is not null;

create table if not exists postventa_notas (
  id uuid primary key default uuid_v7(),
  item_id text not null references mon_postventa(item_id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 3000),
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text,
  -- La actualización de Monday de donde viene (para no traerla dos veces).
  monday_id text unique,
  creado_en timestamptz not null default now()
);
create index if not exists postventa_notas_item on postventa_notas (item_id, creado_en desc);

create table if not exists postventa_actividad (
  id uuid primary key default uuid_v7(),
  item_id text not null references mon_postventa(item_id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 500),
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists postventa_actividad_item on postventa_actividad (item_id, creado_en desc);

create table if not exists postventa_cuentas (
  item_id text primary key references mon_postventa(item_id) on delete cascade,
  datos text not null check (char_length(datos) between 1 and 1000),
  escrito_por uuid references perfiles(id) on delete set null,
  escrito_en timestamptz not null default now()
);
comment on table postventa_cuentas is 'Datos para hacer un reembolso (cuenta, banco, titular). Solo el servidor; se muestran con el permiso despacho-cambios-cuentas y se borran al pasar la solicitud a Hecho.';

alter table postventa_notas enable row level security;
alter table postventa_actividad enable row level security;
alter table postventa_cuentas enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('postventa-adjuntos', 'postventa-adjuntos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- Releer el tablero de Monday una vez, para traer las columnas nuevas y las actualizaciones.
update mon_tableros_extra set cursor_actualizado = null where clase = 'postventa';

-- Los módulos: Cambios y reembolsos para los roles que hoy tienen Logística de tienda (con el mismo nivel); ver los datos para reembolsar, solo Admin y CEO
-- (se le da a Finanzas desde Usuarios y roles).
insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, 'despacho-cambios', pr.solo_lectura
from permisos_rol pr
where pr.modulo = 'tienda-logistica'
on conflict (rol_id, modulo) do nothing;

insert into permisos_rol (rol_id, modulo, solo_lectura)
select r.id, 'despacho-cambios-cuentas', false
from roles r
where r.nombre in ('Admin', 'CEO')
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';
