-- Sistema WMS: «Compras» (Compras PA), calcada de la lista de ClickUp «Compras Dropi PA Panamá» — mismas
-- etapas del flujo de compra y financiamiento (solicitud, cotización, producción, tracking, pagos), sin
-- copiar sus datos de productos ni proveedores reales.

create table if not exists wms_compras (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  nombre text not null,
  etapa text not null default 'backlog' check (
    etapa in (
      'backlog', 'solicitud_local', 'solicitud_internacional', 'cotizar', 'cotizado',
      'evaluacion_proveedor', 'solicitud_proveedor', 'compra_pago', 'produccion', 'tracking',
      'aviso_logistica', 'arribo_mercancia', 'completado', 'descartado'
    )
  ),
  proveedor text,
  cliente text,
  tienda text,
  track_id text,
  orden text,
  producto_relacionado text,
  qty_total numeric,
  monto_total numeric(12, 2),
  primer_pago numeric(12, 2),
  segundo_pago numeric(12, 2),
  pagado_a_proveedor numeric(12, 2),
  pago_pendiente numeric(12, 2),
  cobrado_cliente numeric(12, 2),
  pendiente_cliente numeric(12, 2),
  pago_cliente text,
  cuenta_receptora text,
  factura boolean not null default false,
  financiamiento boolean not null default false,
  revisado_aa boolean not null default false,
  fecha_limite date,
  fecha_llegada date,
  fecha_pago_1 date,
  fecha_pago_2 date,
  fecha_envio date,
  inconveniente text,
  planificacion text,
  documentos text,
  notas text,
  asignado_a uuid references perfiles(id),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists wms_compras_pais_idx on wms_compras (pais_id, creado_en desc);
create index if not exists wms_compras_etapa_idx on wms_compras (etapa);

alter table wms_compras enable row level security;
create policy "authenticated read/write" on wms_compras for all using (auth.role() = 'authenticated');

insert into permisos_rol (rol_id, modulo)
select id, 'compras' from roles where nombre = 'Admin'
on conflict do nothing;
