-- 0956 · Ciclo de la orden de tienda (Shopify): confirmar → despachar → entregar → el mensajero devuelve la plata.
--
-- `estado_entrega` (0909) sigue siendo el estado grueso que usan las vistas y el Excel. Aquí se suma la FASE operativa, que
-- el equipo mueve desde Ventas por tienda › Pipeline:
--   por_confirmar → confirmada → despachada → entregada            (y la plata contra entrega llega por remesas)
--                                  ↘ fallida (se reprograma: vuelve a despachada) · devuelta · cancelada
-- `fase` null = orden anterior al ciclo (Excel viejo): no entra al pipeline.
-- Contra entrega: `cod_esperado` es lo que el mensajero debe cobrar y `ven_cod_remesas` lo que ya devolvió, orden por orden.

alter table ven_ordenes add column if not exists fase text
  check (fase is null or fase in ('por_confirmar', 'confirmada', 'despachada', 'entregada', 'fallida', 'devuelta', 'cancelada'));
alter table ven_ordenes add column if not exists confirmada_en timestamptz;
alter table ven_ordenes add column if not exists confirmada_por text;
alter table ven_ordenes add column if not exists despachada_en timestamptz;
alter table ven_ordenes add column if not exists entregada_en timestamptz;
alter table ven_ordenes add column if not exists repartidor_id uuid references del_repartidores(id);
alter table ven_ordenes add column if not exists cod_esperado numeric(12,2) check (cod_esperado is null or cod_esperado >= 0);
alter table ven_ordenes add column if not exists cod_cobrado numeric(12,2) check (cod_cobrado is null or cod_cobrado >= 0);
alter table ven_ordenes add column if not exists intentos integer not null default 0;
alter table ven_ordenes add column if not exists motivo_fallo text;

create index if not exists ven_ordenes_fase on ven_ordenes (unidad_id, fase) where fase is not null and fase not in ('entregada', 'devuelta', 'cancelada');
create index if not exists ven_ordenes_cod on ven_ordenes (unidad_id, entregada_en) where fase = 'entregada' and cod_esperado > 0;

-- Las órdenes que ya existen entran con la fase que se deduce de su estado; solo las pendientes de los últimos 30 días
-- arrancan «por confirmar» (las más viejas ya se resolvieron fuera del sistema).
update ven_ordenes set fase = case estado_entrega
    when 'entregada' then 'entregada'
    when 'devuelta' then 'devuelta'
    when 'cancelada' then 'cancelada'
    when 'no_gestionada' then 'cancelada'
    when 'en_transito' then 'despachada'
    when 'pendiente' then case when fecha >= current_date - 30 then 'por_confirmar' end
  end
where fase is null;

-- Historia de cada orden: quién la movió, cuándo y con qué dato.
create table if not exists ven_orden_eventos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ven_ordenes(id) on delete cascade,
  tipo text not null check (tipo in ('fase', 'cobro', 'remesa', 'nota')),
  fase_antes text,
  fase_despues text,
  detalle text,
  monto numeric(12,2),
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists ven_orden_eventos_orden on ven_orden_eventos (orden_id, creado_en desc);
alter table ven_orden_eventos enable row level security;

-- Remesas: el mensajero (o la transportadora) entrega la plata cobrada de varias órdenes juntas.
create table if not exists ven_cod_remesas (
  id uuid primary key default gen_random_uuid(),
  repartidor_id uuid references del_repartidores(id),
  transportista text,
  fecha date not null,
  referencia text,
  metodo text not null default 'efectivo' check (metodo in ('efectivo', 'yappy', 'transferencia', 'otro')),
  nota text,
  total numeric(12,2) not null check (total > 0),
  usuario text,
  creado_en timestamptz not null default now(),
  check (repartidor_id is not null or transportista is not null)
);
alter table ven_cod_remesas enable row level security;

create table if not exists ven_cod_remesa_ordenes (
  remesa_id uuid not null references ven_cod_remesas(id) on delete cascade,
  orden_id uuid not null references ven_ordenes(id),
  monto numeric(12,2) not null check (monto > 0),
  primary key (remesa_id, orden_id)
);
create index if not exists ven_cod_remesa_ordenes_orden on ven_cod_remesa_ordenes (orden_id);
alter table ven_cod_remesa_ordenes enable row level security;

-- Saldo contra entrega por orden entregada: lo cobrado, lo remitido y lo que el mensajero todavía tiene.
create or replace view ven_cod_saldo with (security_invoker = true) as
select o.id as orden_id, o.unidad_id, o.numero, o.fecha, o.repartidor_id, o.transportista, o.entregada_en,
       o.cod_esperado as esperado,
       coalesce(o.cod_cobrado, o.cod_esperado) as cobrado,
       coalesce(r.remitido, 0) as remitido,
       greatest(coalesce(o.cod_cobrado, o.cod_esperado) - coalesce(r.remitido, 0), 0) as pendiente,
       (current_date - coalesce((o.entregada_en at time zone 'America/Panama')::date, o.fecha)) as dias
from ven_ordenes o
left join (select orden_id, sum(monto) as remitido from ven_cod_remesa_ordenes group by orden_id) r on r.orden_id = o.id
where o.fase = 'entregada' and o.cod_esperado > 0;

-- Registra una remesa completa o ninguna: cada orden debe ser contra entrega, estar entregada y no pasarse de su saldo.
create or replace function ven_registrar_remesa(
  p_repartidor uuid, p_transportista text, p_fecha date, p_referencia text, p_metodo text, p_nota text, p_usuario text, p_ordenes jsonb
) returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_orden uuid;
  v_monto numeric(12,2);
  v_pendiente numeric(12,2);
begin
  if p_ordenes is null or jsonb_typeof(p_ordenes) <> 'array' or jsonb_array_length(p_ordenes) = 0 then
    raise exception 'La remesa no tiene órdenes.';
  end if;
  insert into ven_cod_remesas (repartidor_id, transportista, fecha, referencia, metodo, nota, total, usuario)
  values (p_repartidor, nullif(trim(p_transportista), ''), p_fecha, nullif(trim(p_referencia), ''), coalesce(p_metodo, 'efectivo'), nullif(trim(p_nota), ''), 0.01, p_usuario)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_ordenes) loop
    v_orden := (v_item ->> 'orden_id')::uuid;
    v_monto := round((v_item ->> 'monto')::numeric, 2);
    if v_monto is null or v_monto <= 0 then raise exception 'Monto inválido en una orden.'; end if;
    perform 1 from ven_ordenes where id = v_orden for update;
    select pendiente into v_pendiente from ven_cod_saldo where orden_id = v_orden;
    if v_pendiente is null then raise exception 'Una orden no es contra entrega entregada.'; end if;
    if v_monto > v_pendiente then raise exception 'El monto pasa del saldo pendiente de una orden (% > %).', v_monto, v_pendiente; end if;
    insert into ven_cod_remesa_ordenes (remesa_id, orden_id, monto) values (v_id, v_orden, v_monto);
    insert into ven_orden_eventos (orden_id, tipo, detalle, monto, usuario)
    values (v_orden, 'remesa', coalesce(nullif(trim(p_referencia), ''), 'Remesa del ' || p_fecha), v_monto, p_usuario);
    v_total := v_total + v_monto;
  end loop;
  update ven_cod_remesas set total = v_total where id = v_id;
  return v_id;
end $$;

comment on column ven_ordenes.fase is 'Portal AF4 360°: fase operativa de la orden (por_confirmar, confirmada, despachada, entregada, fallida, devuelta, cancelada); null = anterior al ciclo.';
comment on table ven_cod_remesas is 'Portal AF4 360°: plata contra entrega que un mensajero o transportadora devolvió, de varias órdenes juntas.';
comment on view ven_cod_saldo is 'Portal AF4 360°: por orden entregada contra entrega, lo cobrado, lo remitido y lo que el mensajero todavía tiene.';

-- Conexión de cada tienda con Shopify desde el portal (el país vive en fin_unidades.pais). El token se guarda cifrado
-- (AES-256-GCM, `cifrado-tokens.ts`) y nunca viaja al navegador. Las tiendas de la variable SHOPIFY_TIENDAS siguen valiendo.
create table if not exists ven_tiendas_conexion (
  unidad_id uuid primary key references fin_unidades(id),
  plataforma text not null default 'shopify' check (plataforma = 'shopify'),
  dominio text not null check (dominio ~ '^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$'),
  token_cifrado text not null,
  activo boolean not null default true,
  ultima_lectura timestamptz,
  ultimo_error text,
  conectado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table ven_tiendas_conexion enable row level security;
comment on table ven_tiendas_conexion is 'Portal AF4 360°: conexión de cada tienda con Shopify (token cifrado, solo servidor).';
