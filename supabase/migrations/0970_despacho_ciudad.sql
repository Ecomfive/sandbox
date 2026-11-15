-- Gestión de tienda › Despacho ciudad y Devoluciones (15 nov 2026, pedido de Hernán: «pasar Monday al sistema… que funcione igual que Monday», para todas las
-- tiendas). Hasta hoy las entregas de ciudad se anotaban en Monday y la tarea `monday` las copiaba a `mon_despachos`, que leen las entregas de los pedidos,
-- Logística, la ficha del pedido y Cobros. Ahora se anotan en el sistema, en esa MISMA tabla: así todo lo que ya la lee sigue igual.
--
--   * Cada fila es de un tablero: `clase` «ciudad» (los repartos del día; el día es `fecha_despacho`) o «devolucion» (los pedidos que volvieron; sus grupos
--     DEVOLUCIÓN CIUDAD / RECHAZADOS-CANCELADOS / REALIZADOS-REPROGRAMADOS van en `grupo`).
--   * Las columnas de Monday que faltaban: Edo. pago, $ Por cobrar, Coste envío, Cambio/retiro/turno, Comentario y Comprobante (su enlace en Monday o el
--     archivo subido al sistema, bucket privado `despacho-comprobantes`), y el orden dentro del día (`posicion`).
--   * Una fila creada en el sistema lleva `item_id` «S» + 32 cifras hexadecimales y `tablero_id` «sistema». Una fila que se edita en el sistema queda con
--     `editado_en`: desde ahí la lectura de Monday ya no la pisa (manda el sistema).
--   * `despacho_notas` (las actualizaciones, como los comentarios de Monday) y `despacho_actividad` (quién cambió qué).
--   * Se suman a la lectura los tableros de devoluciones de Nuvo y ClickSi (Kenku y Oferfy ya se leían) y se relee todo una vez para traer las columnas nuevas.
--
-- Solo el servidor lee y escribe (RLS sin políticas). Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0970_rollback.sql

alter table mon_despachos drop constraint if exists mon_despachos_item_id_check;
alter table mon_despachos add constraint mon_despachos_item_id_check check (item_id ~ '^([0-9]{1,20}|S[0-9a-f]{32})$');

alter table mon_despachos add column if not exists clase text not null default 'ciudad';
alter table mon_despachos drop constraint if exists mon_despachos_clase_check;
alter table mon_despachos add constraint mon_despachos_clase_check check (clase in ('ciudad', 'devolucion'));
alter table mon_despachos add column if not exists grupo text check (grupo is null or length(grupo) <= 120);
alter table mon_despachos add column if not exists edo_pago text check (edo_pago is null or length(edo_pago) <= 60);
alter table mon_despachos add column if not exists por_cobrar numeric(12, 2) check (por_cobrar is null or por_cobrar >= 0);
alter table mon_despachos add column if not exists coste_envio numeric(12, 2) check (coste_envio is null or coste_envio >= 0);
alter table mon_despachos add column if not exists turno text check (turno is null or length(turno) <= 60);
alter table mon_despachos add column if not exists comentario text check (comentario is null or length(comentario) <= 1000);
alter table mon_despachos add column if not exists comprobantes text[] not null default '{}';
alter table mon_despachos add column if not exists posicion integer not null default 0;
alter table mon_despachos add column if not exists origen text not null default 'monday';
alter table mon_despachos drop constraint if exists mon_despachos_origen_check;
alter table mon_despachos add constraint mon_despachos_origen_check check (origen in ('monday', 'sistema'));
alter table mon_despachos add column if not exists editado_en timestamptz;
alter table mon_despachos add column if not exists editado_por uuid references perfiles(id) on delete set null;

create index if not exists mon_despachos_clase_fecha on mon_despachos (clase, fecha_despacho desc);

-- Los tableros de devoluciones son de clase «devolucion».
update mon_despachos d set clase = 'devolucion'
from mon_tableros_extra t
where t.tablero_id = d.tablero_id and t.nombre ilike 'devoluc%' and d.clase <> 'devolucion';

create table if not exists despacho_notas (
  id uuid primary key default uuid_v7(),
  item_id text not null references mon_despachos(item_id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 2000),
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists despacho_notas_item on despacho_notas (item_id, creado_en desc);

create table if not exists despacho_actividad (
  id uuid primary key default uuid_v7(),
  item_id text not null references mon_despachos(item_id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 500),
  autor_id uuid references perfiles(id) on delete set null,
  autor_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists despacho_actividad_item on despacho_actividad (item_id, creado_en desc);

alter table despacho_notas enable row level security;
alter table despacho_actividad enable row level security;

-- Los comprobantes que se suben en el sistema (foto o PDF del pago), privados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('despacho-comprobantes', 'despacho-comprobantes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- Los tableros de devoluciones de Nuvo y ClickSi (Kenku y Oferfy ya se leían).
insert into mon_tableros_extra (tablero_id, nombre) values
  ('18429025062', 'Devoluciones Nuvo'),
  ('18429046569', 'Devoluciones ClickSi')
on conflict (tablero_id) do nothing;

-- Releer Monday entero una vez, para traer las columnas nuevas de lo que ya estaba leído.
update mon_config set cursor_actualizado = null where id = 1;
update mon_tableros_extra set cursor_actualizado = null where clase = 'despachos';

-- Los módulos, para los roles que hoy tienen Logística de tienda (con el mismo nivel).
insert into permisos_rol (rol_id, modulo, solo_lectura)
select pr.rol_id, m.modulo, pr.solo_lectura
from permisos_rol pr
cross join (values ('despacho-ciudad'), ('despacho-devoluciones')) as m (modulo)
where pr.modulo = 'tienda-logistica'
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';
