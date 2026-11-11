-- Pipeline de Shopify, segunda etapa (2 nov 2026): contactos de confirmación, notas, riesgo de clientes, cobertura y
-- capacidad de mensajeros, entrega con prueba, remesas anulables, incidencias, cierre de mes y aprobaciones.
-- Todo idempotente. RLS activado y sin políticas (solo el servidor con la clave de servicio).

alter table ven_ordenes
  add column if not exists asignada_a text,
  add column if not exists congelada boolean not null default false,
  add column if not exists congelada_motivo text,
  add column if not exists prometida_para date,
  add column if not exists reprogramada_para timestamptz,
  add column if not exists motivo_fallo_codigo text,
  add column if not exists recibe_nombre text,
  add column if not exists recibe_documento text,
  add column if not exists prueba_ruta text,
  add column if not exists codigo_entrega text,
  add column if not exists comision_pasarela numeric(14, 2) not null default 0 check (comision_pasarela >= 0),
  add column if not exists comision_mensajero numeric(14, 2) not null default 0 check (comision_mensajero >= 0),
  add column if not exists costo_envio_real numeric(14, 2),
  add column if not exists retiro_en_punto boolean not null default false,
  add column if not exists confirmada_con_cambios boolean not null default false,
  add column if not exists stock_descontado boolean not null default false,
  add column if not exists stock_reservado boolean not null default false,
  add column if not exists duplicada_de uuid references ven_ordenes(id) on delete set null,
  add column if not exists ruta_orden smallint;
create index if not exists ven_ordenes_asignada on ven_ordenes (asignada_a) where fase = 'por_confirmar';

alter table ven_ordenes_clientes add column if not exists telefono_clave text;
create index if not exists ven_ordenes_clientes_tel on ven_ordenes_clientes (telefono_clave) where telefono_clave is not null;

create table if not exists ven_orden_contactos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ven_ordenes(id) on delete cascade,
  canal text not null check (canal in ('llamada', 'whatsapp', 'sms', 'otro')),
  resultado text not null check (resultado in ('confirmo', 'no_contesta', 'cambio_datos', 'cancela', 'ocupado', 'numero_malo')),
  nota text,
  por text,
  creado_en timestamptz not null default now()
);
create index if not exists ven_orden_contactos_orden on ven_orden_contactos (orden_id, creado_en desc);

create table if not exists ven_orden_notas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ven_ordenes(id) on delete cascade,
  texto text not null check (length(texto) between 1 and 2000),
  autor text,
  menciones text[] not null default '{}',
  creado_en timestamptz not null default now()
);
create index if not exists ven_orden_notas_orden on ven_orden_notas (orden_id, creado_en desc);

create table if not exists ven_clientes_lista (
  telefono_clave text primary key,
  tipo text not null check (tipo in ('negra', 'blanca')),
  nota text,
  por text,
  creado_en timestamptz not null default now()
);

create table if not exists ven_cobertura (
  id uuid primary key default gen_random_uuid(),
  pais text not null check (pais in ('PA', 'CR', 'MX')),
  zona text not null,
  repartidor_id uuid references del_repartidores(id) on delete cascade,
  transportista text,
  tarifa numeric(14, 2) check (tarifa is null or tarifa >= 0),
  prioridad smallint not null default 1,
  check (repartidor_id is not null or transportista is not null),
  unique (pais, zona, repartidor_id, transportista)
);
create index if not exists ven_cobertura_zona on ven_cobertura (pais, zona);

create table if not exists ven_mensajero_config (
  repartidor_id uuid primary key references del_repartidores(id) on delete cascade,
  capacidad_diaria integer check (capacidad_diaria is null or capacidad_diaria > 0),
  limite_efectivo numeric(14, 2) check (limite_efectivo is null or limite_efectivo > 0),
  comision_entrega numeric(14, 2) check (comision_entrega is null or comision_entrega >= 0),
  actualizado_en timestamptz not null default now()
);

create table if not exists ven_config (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);
insert into ven_config (clave, valor) values
  ('umbrales', '{"horas_confirmar_alerta": 4, "horas_confirmar_vencida": 24, "horas_reconfirmar": 48, "dias_estancada": 3, "max_intentos_contacto": 3, "max_intentos_entrega": 3, "dias_alerta_remesa": 7, "monto_aprobacion": 150}'::jsonb),
  ('horario_contacto', '{"PA": {"desde": 8, "hasta": 20}, "CR": {"desde": 8, "hasta": 20}, "MX": {"desde": 8, "hasta": 20}}'::jsonb)
on conflict (clave) do nothing;

create table if not exists ven_incidencias (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ven_ordenes(id) on delete cascade,
  tipo text not null check (tipo in ('producto_danado', 'paquete_perdido', 'faltante_efectivo', 'direccion_erronea', 'otro')),
  descripcion text,
  costo numeric(14, 2) not null default 0 check (costo >= 0),
  responsable text,
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta')),
  creada_por text,
  creado_en timestamptz not null default now(),
  resuelta_en timestamptz
);
create index if not exists ven_incidencias_orden on ven_incidencias (orden_id);

create table if not exists ven_devoluciones_recepcion (
  orden_id uuid primary key references ven_ordenes(id) on delete cascade,
  decision text not null check (decision in ('reingresar', 'danado', 'descartar')),
  nota text,
  recibida_por text,
  recibida_en timestamptz not null default now()
);

-- Remesas: se pueden anular (con motivo y quién), sin borrar nada.
alter table ven_cod_remesas
  add column if not exists anulada_en timestamptz,
  add column if not exists anulada_por text,
  add column if not exists anulada_motivo text,
  add column if not exists diferencia_motivo text,
  add column if not exists recibo_aceptado_por text;

create table if not exists ven_cierres (
  periodo date not null check (extract(day from periodo) = 1),
  pais text not null default 'TODOS',
  cerrado_en timestamptz not null default now(),
  cerrado_por text,
  primary key (periodo, pais)
);

create table if not exists ven_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  accion text not null check (accion in ('cancelar_orden', 'anular_remesa')),
  referencia uuid not null,
  detalle text,
  monto numeric(14, 2),
  solicitada_por text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  resuelta_por text,
  resuelta_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists ven_aprobaciones_estado on ven_aprobaciones (estado, creado_en desc);

alter table ven_tiendas_conexion
  add column if not exists importar_desde date,
  add column if not exists permisos text[],
  add column if not exists pausada boolean not null default false,
  add column if not exists moneda text,
  add column if not exists bodega_id uuid,
  add column if not exists pasarela_pct numeric(5, 2) not null default 0 check (pasarela_pct >= 0),
  add column if not exists pasarela_fijo numeric(8, 2) not null default 0 check (pasarela_fijo >= 0),
  add column if not exists itbms_tasa numeric(5, 4) not null default 0 check (itbms_tasa >= 0);

-- El saldo ya no cuenta las remesas anuladas.
create or replace view ven_cod_saldo with (security_invoker = true) as
select o.id as orden_id, o.unidad_id, o.numero, o.fecha, o.repartidor_id, o.transportista, o.entregada_en,
       o.cod_esperado as esperado,
       coalesce(o.cod_cobrado, o.cod_esperado) as cobrado,
       coalesce(r.remitido, 0) as remitido,
       greatest(coalesce(o.cod_cobrado, o.cod_esperado) - coalesce(r.remitido, 0), 0) as pendiente,
       (current_date - coalesce((o.entregada_en at time zone 'America/Panama')::date, o.fecha)) as dias
from ven_ordenes o
left join (select ro.orden_id, sum(ro.monto) as remitido from ven_cod_remesa_ordenes ro join ven_cod_remesas rm on rm.id = ro.remesa_id
           where rm.anulada_en is null group by ro.orden_id) r on r.orden_id = o.id
where o.fase = 'entregada' and o.cod_esperado > 0;

-- Saldo del mensajero por antigüedad.
create or replace view ven_cod_antiguedad with (security_invoker = true) as
select repartidor_id, transportista,
  coalesce(sum(pendiente) filter (where dias <= 3), 0) as d0_3,
  coalesce(sum(pendiente) filter (where dias between 4 and 7), 0) as d4_7,
  coalesce(sum(pendiente) filter (where dias between 8 and 14), 0) as d8_14,
  coalesce(sum(pendiente) filter (where dias > 14), 0) as d15_mas,
  coalesce(sum(pendiente), 0) as total
from ven_cod_saldo where pendiente > 0 group by repartidor_id, transportista;

-- Anular una remesa: quita sus aplicaciones del saldo (las filas quedan, marcadas) y deja el motivo.
create or replace function ven_anular_remesa(p_remesa uuid, p_motivo text, p_usuario text)
returns void language plpgsql as $$
begin
  if p_motivo is null or length(trim(p_motivo)) < 5 then raise exception 'El motivo de la anulación es obligatorio.'; end if;
  perform 1 from ven_cod_remesas where id = p_remesa and anulada_en is null for update;
  if not found then raise exception 'La remesa no existe o ya está anulada.'; end if;
  update ven_cod_remesas set anulada_en = now(), anulada_por = p_usuario, anulada_motivo = trim(p_motivo) where id = p_remesa;
end $$;
revoke all on function ven_anular_remesa(uuid, text, text) from public;

alter table ven_orden_contactos enable row level security;
alter table ven_orden_notas enable row level security;
alter table ven_clientes_lista enable row level security;
alter table ven_cobertura enable row level security;
alter table ven_mensajero_config enable row level security;
alter table ven_config enable row level security;
alter table ven_incidencias enable row level security;
alter table ven_devoluciones_recepcion enable row level security;
alter table ven_cierres enable row level security;
alter table ven_aprobaciones enable row level security;
