-- Envíos Delivery › Cierres y Control de envíos, y «Mis pagos» con el recibo firmado en la app del delivery (25 nov 2026, pedido de Hernán y Yiletsi;
-- prototipo aprobado https://claude.ai/artifact/8mbjcbJGELtkGhvmpSdKhX). Reemplaza las hojas «GESTION DELIVERY II», «CIERRE SEMANAL DELIVERY» y
-- «RECIBOS DE PAGOS»: el sistema calcula lo que se le paga a cada delivery en la semana (de jueves a miércoles) con la tarifa de cada delivery
-- (entrega y fallido con evidencia; cambio, complemento y retiro); Yiletsi agrega propinas, ajustes y una nota, cierra la semana y el delivery la ve en
-- su app y firma el recibo de Oceans (ClickSi le paga aparte, sin recibo).
--   * `despacho_deliverys`: cada delivery con los datos del recibo (nombre completo, cédula, forma de pago), sus tarifas y sus nombres en Envíos
--     Delivery (Deimibel tiene varios tableros y un solo recibo).
--   * `despacho_semanas`: la semana de cada delivery: propinas y ajustes, nota, lo que se le mandó (foto del cálculo) y el recibo firmado.
--   * Almacenamiento privado `despacho-recibos`: los PDF firmados (y la firma), que solo se abren con sesión.
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0366_rollback.sql
create table if not exists despacho_deliverys (
  id uuid primary key default uuid_v7(),
  nombre text not null check (char_length(nombre) between 1 and 80),
  nombre_completo text check (nombre_completo is null or char_length(nombre_completo) <= 120),
  cedula text check (cedula is null or char_length(cedula) <= 40),
  forma_pago text not null default 'transferencia' check (forma_pago in ('transferencia', 'efectivo', 'yappy')),
  couriers text[] not null default '{}',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
-- Las tarifas de cada delivery: entrega (y fallido con evidencia) y cambio, complemento o retiro. Deimibel (rutas alejadas) cobra más.
alter table despacho_deliverys add column if not exists tarifa_entrega numeric(8, 2) not null default 3.65 check (tarifa_entrega between 0 and 100);
alter table despacho_deliverys add column if not exists tarifa_cambio numeric(8, 2) not null default 2.00 check (tarifa_cambio between 0 and 100);
alter table despacho_deliverys enable row level security;

create table if not exists despacho_semanas (
  id uuid primary key default uuid_v7(),
  delivery_id uuid not null references despacho_deliverys(id) on delete cascade,
  semana date not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'enviada', 'firmada')),
  ajustes jsonb not null default '[]'::jsonb,
  nota text check (nota is null or char_length(nota) <= 1500),
  detalle jsonb,
  total_oceans numeric(12, 2),
  total_clicksi numeric(12, 2),
  fecha_pago date,
  enviada_por uuid references perfiles(id) on delete set null,
  enviada_en timestamptz,
  firmada_en timestamptz,
  firma_ruta text,
  pdf_ruta text,
  codigo text,
  actualizado_en timestamptz not null default now(),
  unique (delivery_id, semana)
);
-- Las firmas anuladas (para corregir una semana ya firmada): el PDF anterior queda guardado y anotado aquí.
alter table despacho_semanas add column if not exists anulados jsonb not null default '[]'::jsonb;
create index if not exists despacho_semanas_semana on despacho_semanas (semana desc);
alter table despacho_semanas enable row level security;

-- Los recibos firmados (PDF) y las firmas (PNG), privados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('despacho-recibos', 'despacho-recibos', false, 5242880, array['application/pdf', 'image/png'])
on conflict (id) do nothing;

-- Los deliverys de hoy, con sus nombres en Envíos Delivery (Yiletsi completa nombre completo y cédula en el sistema).
insert into despacho_deliverys (nombre, couriers)
select v.nombre, v.couriers from (values
  ('July Calle', array['JULY CALLE']),
  ('Aníbal Pérez', array['ANIBAL PEREZ']),
  ('Andrés Álvarez', array['ANDRÉS ÁLVAREZ']),
  ('Yoselyn Viaña', array['YOSELYN VIAÑA']),
  ('Deimibel Ávila', array['DEIMIBEL', 'DEIMIBEL CIUDAD', 'DEIMIBEL ZONA 5']),
  ('Gilberto Parra', array['GILBERTO PARRA']),
  ('Usuario de prueba', array['USUARIO DE PRUEBA'])
) as v(nombre, couriers)
where not exists (select 1 from despacho_deliverys d where d.nombre = v.nombre);

-- Deimibel (Ciudad y Zona 5, rutas alejadas): $5.00 la entrega y $2.50 el cambio, complemento o retiro «por ahora».
update despacho_deliverys set tarifa_entrega = 5.00, tarifa_cambio = 2.50
where nombre = 'Deimibel Ávila' and tarifa_entrega = 3.65 and tarifa_cambio = 2.00;

notify pgrst, 'reload schema';

-- Revisión: las cuatro filas deben decir «sí».
select 'deliverys cargados' as que, case when (select count(*) from despacho_deliverys) >= 7 then 'sí' else 'NO' end as quedo
union all
select 'tarifas de Deimibel', case when exists (select 1 from despacho_deliverys where nombre = 'Deimibel Ávila' and tarifa_entrega = 5) then 'sí' else 'NO' end
union all
select 'semanas de pago', case when to_regclass('public.despacho_semanas') is not null then 'sí' else 'NO' end
union all
select 'archivo de recibos', case when exists (select 1 from storage.buckets where id = 'despacho-recibos') then 'sí' else 'NO' end;
