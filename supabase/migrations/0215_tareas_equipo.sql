-- Equipo › Tareas (31 oct 2026, pedido de Alcides): un tablero de tareas del equipo como su lista «Lideres Empresas» de ClickUp, pero en el
-- sistema (módulo temporal, hasta reorganizarlo). Cada tarea: título, descripción, persona asignada, estado (Backlog, Pendiente, En progreso, En
-- revisión, Aprobado, Rechazado, Hecho y, cerrado, Archivado), fecha de inicio, fecha límite, prioridad y, si quiere, el módulo del sistema al
-- que se refiere. Cada persona ve las suyas (asignadas o creadas por ella); un administrador ve y asigna todas.
-- Arranca con la lista de lo que queda pendiente en el sistema (sin asignar, creadas por Alcides) para que él las reparta.
-- RLS activado y sin políticas: solo el servidor la toca. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0215_rollback.sql

create sequence if not exists tareas_equipo_numero_seq;

create table if not exists tareas_equipo (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('tareas_equipo_numero_seq'),
  titulo text not null check (char_length(titulo) between 1 and 200),
  descripcion text check (descripcion is null or char_length(descripcion) <= 5000),
  estado text not null default 'pendiente'
    check (estado in ('backlog', 'pendiente', 'en_progreso', 'en_revision', 'aprobado', 'rechazado', 'hecho', 'archivado')),
  prioridad text check (prioridad is null or prioridad in ('urgente', 'alta', 'normal', 'baja')),
  responsable_id uuid references perfiles(id) on delete set null,
  fecha_inicio date,
  fecha_limite date,
  modulo text check (modulo is null or char_length(modulo) <= 60),
  creado_por uuid references perfiles(id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  hecha_en timestamptz
);
alter sequence tareas_equipo_numero_seq owned by tareas_equipo.numero;

create index if not exists tareas_equipo_responsable on tareas_equipo (responsable_id, estado);
create index if not exists tareas_equipo_creado_por on tareas_equipo (creado_por);

alter table tareas_equipo enable row level security;

-- El módulo «tareas» para todos los roles, con edición (cada uno solo toca las suyas: lo comprueba el servidor).
insert into permisos_rol (rol_id, modulo, solo_lectura)
select r.id, 'tareas', false from roles r
on conflict (rol_id, modulo) do nothing;

-- Lo pendiente en el sistema al 31 oct 2026, sin asignar, para que Alcides lo reparta. Solo si la tabla está vacía (correrla de nuevo no duplica).
insert into tareas_equipo (titulo, descripcion, estado, prioridad, modulo, creado_por, creado_por_nombre)
select t.titulo, t.descripcion, 'pendiente', t.prioridad, t.modulo, p.id, coalesce(p.nombre, 'Alcides Andrade')
from (values
  ('México: bodega B3903 «Dropi Monterrey» y cómo republicar',
   'La B3903 también es de Dropi (como la B49). Falta sumarla a las bodegas de Dropi y definir cómo se republica en México, que no es igual que en Panamá.',
   'alta', 'publicaciones-dropi'),
  ('México: poner el fulfillment de Dropi en Configuración',
   'En Configuración, con México elegido arriba, escribir cuánto cobra Dropi México por pedido (en pesos). Hoy está vacío y las 64 publicaciones de México no lo restan.',
   'alta', 'configuracion'),
  ('Costa Rica: 6 publicaciones sin costo de mercancía',
   'PUB-0536 (lentes TR90), PUB-0541 (Purifying Gel), PUB-0482 (combo Aichun), PUB-0459 (aceite de orégano 300), PUB-0512 (spray Dr. Melaxin) y PUB-0464 (aceite Lefun): su producto no tiene compra con costo. Además PUB-0630 tiene ₡2.83 (parece un valor en dólares).',
   'normal', 'publicaciones-dropi'),
  ('Costa Rica: 11 publicaciones con precio ₡1 000 o ₡1',
   'Salen con margen negativo. Siete están activas: PUB-0533, 0532, 0530, 0490, 0627, 0628 y 0629. Revisar si el precio está mal leído de Dropi o son de prueba.',
   'alta', 'publicaciones-dropi'),
  ('Retiros: tolerancia de conciliación por moneda',
   'La diferencia que se acepta al conciliar es la misma cifra en dólares y en colones: en Costa Rica es mucho más estricta. Definir una por país.',
   'normal', 'retiros'),
  ('Retiros: retirar al cambio según la moneda',
   'Costa Rica paga y cobra en colones y se retira al cambio de la moneda que se elija. Hoy el retiro no guarda en qué moneda se recibe ni el tipo de cambio.',
   'normal', 'retiros'),
  ('Tipo de cambio oficial para los cierres',
   'El tipo de cambio sale de un servicio gratuito de internet. Para cierres contables conviene el oficial (Banco Central de Costa Rica, Banxico).',
   'normal', 'extractos'),
  ('Compras en México: «$» se confunde con pesos',
   'Compras siempre está en dólares y se escribe con «$». En México, el peso también usa «$». Decidir si Compras muestra «US$».',
   'baja', 'compras'),
  ('WhatsApp: plantilla «mensaje_interno» para Meta',
   'Agregarla desde CRM › Plantillas y pulsar «Mandar a Meta» para que el WhatsApp interno pueda escribir pasadas 24 horas.',
   'normal', 'crm-dropshippers'),
  ('CRM: «Pasar a Comercial» crea un seguimiento que ya no se ve',
   'Los seguimientos se quitaron de las fichas. Decidir si se quita el botón o qué debe crear.',
   'baja', 'crm-dropshippers'),
  ('WhatsApp: guardar fotos y audios antes de que Meta los borre',
   'Meta guarda los archivos de los mensajes unos 30 días. Falta copiarlos al sistema.',
   'normal', 'crm-dropshippers'),
  ('WhatsApp: «No, gracias» en el primer contacto',
   'Cuando un contacto nuevo responde «No, gracias», marcar el chat como resuelto y no volver a escribirle primero.',
   'normal', 'crm-dropshippers'),
  ('WhatsApp: avisar al cliente cuando llega la mercancía',
   'Hoy «Avisarme cuando llegue» avisa solo al equipo. Falta mandar al cliente la plantilla de llegada con el producto y la fecha.',
   'normal', 'crm-dropshippers'),
  ('Dropi: probar privatizar y crear producto con Dropi real',
   'Privatizar en Dropi y publicar un producto nuevo están probados contra un Dropi simulado. Falta una prueba real de cada uno.',
   'alta', 'publicaciones-dropi'),
  ('Inventario: conectar el descuento automático por venta',
   'wms_aplicar_venta ya reserva, libera y despacha por SKU, pero no está conectada a Dropi ni a Shopify.',
   'normal', 'inventario'),
  ('Unir «Apagar en Dropi» con «Archivar»',
   'Propuesta pendiente de decidir: un solo botón para sacar el stock y archivar.',
   'baja', 'publicaciones-dropi'),
  ('Promociones para 89 productos de bajo rendimiento',
   'Hay un Excel en datos-privados con los 89 productos de peor rendimiento para decidir promociones.',
   'normal', 'ventas-dropi'),
  ('Rendimiento: límite a los rangos de fechas personalizados',
   'Último punto de RENDIMIENTO-PENDIENTE.md: un rango muy largo hace lenta la página.',
   'baja', null),
  ('WhatsApp: cifrar los números de teléfono (etapa 2)',
   'Hoy los números se ocultan en pantalla pero en la base están en texto normal.',
   'baja', 'crm-dropshippers')
) as t(titulo, descripcion, prioridad, modulo)
left join perfiles p on lower(p.email) = 'coo.andrade@gmail.com'
where not exists (select 1 from tareas_equipo);
