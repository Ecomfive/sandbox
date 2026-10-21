-- Portal del proveedor, fase 1 (pedido de Hernán, 21 oct 2026; plan en PORTAL-PROVEEDOR.md): la base y el espejo.
--
-- Chin (proveedor y agente logístico) va a cotizar, marcar envíos y confirmar pagos desde un portal aparte, sin entrar al sistema.
-- Lo que ve no es `wms_compras` sino un ESPEJO (`proveedor_pedidos`) que un disparador mantiene al día: cada compra cuyo proveedor
-- es uno de `proveedores` y que está de «01 - Cotizar» en adelante tiene su fila, con solo lo que el proveedor puede ver. La compra
-- sigue siendo la fuente: lo que el proveedor cambie se aplica a la compra (fases 3 y 4) y el disparador lo trae de vuelta.
--
-- Si algo falla al copiar, el disparador solo deja un aviso en el registro: la compra se guarda igual (Compras nunca se bloquea
-- por el espejo).
--
-- Todas las tablas con RLS y sin políticas (solo el servidor, ver 0063 y SEGURIDAD.md).

-- 1) Proveedores con portal.
create table if not exists proveedores (
  id uuid primary key default uuid_v7(),
  nombre text not null unique,
  -- El texto de `wms_compras.proveedor` (y de `wms_rutas_envio.agente`) que identifica sus compras, sin importar mayúsculas.
  nombre_en_compras text not null unique,
  dias_anticipo int not null default 10 check (dias_anticipo between 0 and 120),
  porcentaje_anticipo numeric(5,2) not null default 50 check (porcentaje_anticipo between 0 and 100),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table proveedores enable row level security;
insert into proveedores (nombre, nombre_en_compras) values ('Chin', 'Chin') on conflict (nombre) do nothing;

-- 2) Las cuentas del portal. NO tienen fila en `perfiles`: el sistema no las reconoce como personas del equipo.
create table if not exists proveedor_usuarios (
  id uuid primary key default uuid_v7(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table proveedor_usuarios enable row level security;

-- 3) La nota para el proveedor vive en la compra (la escribe Ecomfive; la ve el proveedor).
alter table wms_compras add column if not exists nota_proveedor text;

-- 4) El espejo.
create table if not exists proveedor_pedidos (
  id uuid primary key default uuid_v7(),
  compra_id uuid not null unique references wms_compras(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  -- false si la compra dejó de ser del proveedor, volvió a Backlog o se anuló: el portal no la muestra (los datos se conservan).
  visible boolean not null default true,
  referencia text,
  producto text not null,
  foto_referencia text,
  pais_codigo text,
  via text not null default 'mar' check (via in ('mar', 'aire')),
  modalidad text,
  etapa text not null check (etapa in ('por_cotizar', 'cotizado', 'produccion', 'enviado', 'llegado', 'descartado')),
  -- Lo que Ecomfive pidió (se congela al salir de «Por cotizar») y lo que va en la compra (el proveedor puede cambiarlo al cotizar).
  unidades_pedidas numeric,
  unidades numeric,
  monto_total numeric(12,2),
  costo_unitario numeric(14,4),
  nota_para_proveedor text,
  fecha_envio date,
  fecha_llegada date,
  primer_pago numeric(12,2),
  fecha_pago_1 date,
  segundo_pago numeric(12,2),
  fecha_pago_2 date,
  pagado_a_proveedor numeric(12,2),
  -- Solo del proveedor (el disparador no las toca).
  foto_real_ruta text,
  comentario_proveedor text,
  cotizado_en timestamptz,
  enviado_marcado_en timestamptz,
  visto_proveedor_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists proveedor_pedidos_portal on proveedor_pedidos (proveedor_id, etapa) where visible;
alter table proveedor_pedidos enable row level security;

-- 5) Avisos de pago: Ecomfive avisa (monto, referencia, comprobante y a qué cuotas va) y el proveedor lo confirma.
create table if not exists proveedor_avisos_pago (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  fecha date not null,
  monto numeric(12,2) not null check (monto > 0),
  referencia text,
  comprobante_ruta text,
  estado text not null default 'avisado' check (estado in ('avisado', 'confirmado')),
  avisado_por uuid references perfiles(id) on delete set null,
  avisado_por_nombre text,
  confirmado_por uuid references proveedor_usuarios(id) on delete set null,
  confirmado_en timestamptz,
  creado_en timestamptz not null default now()
);
alter table proveedor_avisos_pago enable row level security;

create table if not exists proveedor_aviso_cuotas (
  id uuid primary key default uuid_v7(),
  aviso_id uuid not null references proveedor_avisos_pago(id) on delete cascade,
  pedido_id uuid not null references proveedor_pedidos(id) on delete cascade,
  cuota text not null check (cuota in ('anticipo', 'saldo')),
  monto numeric(12,2) not null check (monto > 0),
  unique (aviso_id, pedido_id, cuota)
);
alter table proveedor_aviso_cuotas enable row level security;

-- 6) Lo que cambió cada lado: «Novedades del proveedor» (lado proveedor) y lo nuevo para el proveedor (lado ecomfive).
create table if not exists proveedor_novedades (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  pedido_id uuid references proveedor_pedidos(id) on delete cascade,
  lado text not null check (lado in ('proveedor', 'ecomfive')),
  tipo text not null check (tipo in ('cotizacion', 'foto', 'envio', 'llegada', 'decision', 'pago', 'pedido')),
  texto text not null,
  detalle text,
  autor_nombre text,
  leida_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists proveedor_novedades_lista on proveedor_novedades (proveedor_id, lado, creado_en desc);
alter table proveedor_novedades enable row level security;

-- 7) La campana también avisa los cambios del proveedor.
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor'));

-- 8) Fotos reales y comprobantes: bucket privado, por proveedor y pedido.
insert into storage.buckets (id, name, public) values ('proveedor-portal', 'proveedor-portal', false) on conflict (id) do nothing;
update storage.buckets set file_size_limit = 26214400 where id = 'proveedor-portal';

-- 9) Plazo acordado con Chin para Costa Rica por mar: 80 días (21 oct 2026).
update wms_rutas_envio set dias_min = 80, dias_max = 80, actualizado_en = now()
where lower(btrim(agente)) = 'chin' and pais_codigo = 'CR' and via = 'mar';

-- 10) Copiar una compra al espejo. La misma regla está en src/lib/proveedor/espejo.ts (una prueba compara las dos).
create or replace function proveedor_sincronizar(p_compra uuid) returns void
language plpgsql as $$
declare
  c wms_compras%rowtype;
  v_prov proveedores%rowtype;
  v_etapa text;
  v_pais text;
  v_via text;
  v_modalidad text;
  v_costo numeric;
  v_items int;
begin
  select * into c from wms_compras where id = p_compra;
  if not found then return; end if;

  select * into v_prov from proveedores
  where activo and lower(btrim(nombre_en_compras)) = lower(btrim(coalesce(c.proveedor, '')));

  v_etapa := case c.etapa
    when 'cotizar' then 'por_cotizar'
    when 'cotizado' then 'cotizado'
    when 'produccion' then 'produccion'
    when 'tracking' then 'enviado'
    when 'arribo_mercancia' then 'llegado'
    when 'completado' then 'llegado'
    when 'descartado' then 'descartado'
    else null
  end;

  -- No es del proveedor, está en Backlog (o en una etapa retirada) o se anuló: se oculta si ya estaba.
  if v_prov.id is null or v_etapa is null or c.anulada_en is not null or c.tipo <> 'pais' then
    update proveedor_pedidos set visible = false, actualizado_en = now() where compra_id = p_compra and visible;
    return;
  end if;

  select codigo into v_pais from paises where id = c.pais_id;
  -- Una sola vía en el portal: aéreo solo si es lo único que lleva; terrestre o sin vía cuentan como marítimo.
  v_via := case when coalesce(c.via_envio, '{}'::text[]) = array['aire']::text[] then 'aire' else 'mar' end;
  select modalidad into v_modalidad from wms_rutas_envio
  where activo and lower(btrim(agente)) = lower(btrim(v_prov.nombre_en_compras)) and pais_codigo = v_pais and via = v_via
  order by actualizado_en desc limit 1;
  -- Costo por unidad: el de su línea de producto si tiene una sola; si no, total ÷ unidades.
  select count(*), max(costo_unitario) into v_items, v_costo from wms_compra_items where compra_id = p_compra;
  if v_items <> 1 or v_costo is null then
    v_costo := case when coalesce(c.qty_total, 0) > 0 and c.monto_total is not null then round(c.monto_total / c.qty_total, 4) end;
  end if;

  insert into proveedor_pedidos as p (
    compra_id, proveedor_id, visible, referencia, producto, foto_referencia, pais_codigo, via, modalidad, etapa,
    unidades_pedidas, unidades, monto_total, costo_unitario, nota_para_proveedor, fecha_envio, fecha_llegada,
    primer_pago, fecha_pago_1, segundo_pago, fecha_pago_2, pagado_a_proveedor
  ) values (
    c.id, v_prov.id, true, c.codigo, coalesce(nullif(btrim(c.nombre), ''), 'Sin nombre'), c.foto_url, v_pais, v_via, v_modalidad, v_etapa,
    c.qty_total, c.qty_total, c.monto_total, v_costo, c.nota_proveedor, c.fecha_envio, c.fecha_llegada,
    c.primer_pago, c.fecha_pago_1, c.segundo_pago, c.fecha_pago_2, c.pagado_a_proveedor
  )
  on conflict (compra_id) do update set
    proveedor_id = excluded.proveedor_id,
    visible = true,
    referencia = excluded.referencia,
    producto = excluded.producto,
    foto_referencia = excluded.foto_referencia,
    pais_codigo = excluded.pais_codigo,
    via = excluded.via,
    modalidad = excluded.modalidad,
    etapa = excluded.etapa,
    -- Lo pedido sigue a la compra mientras está en «Por cotizar»; después queda fijo para ver si el proveedor cambió las unidades.
    unidades_pedidas = case when excluded.etapa = 'por_cotizar' or p.unidades_pedidas is null then excluded.unidades_pedidas else p.unidades_pedidas end,
    unidades = excluded.unidades,
    monto_total = excluded.monto_total,
    costo_unitario = excluded.costo_unitario,
    nota_para_proveedor = excluded.nota_para_proveedor,
    fecha_envio = excluded.fecha_envio,
    fecha_llegada = excluded.fecha_llegada,
    primer_pago = excluded.primer_pago,
    fecha_pago_1 = excluded.fecha_pago_1,
    segundo_pago = excluded.segundo_pago,
    fecha_pago_2 = excluded.fecha_pago_2,
    pagado_a_proveedor = excluded.pagado_a_proveedor,
    actualizado_en = now();
end;
$$;

create or replace function proveedor_sincronizar_compra() returns trigger
language plpgsql as $$
begin
  begin
    perform proveedor_sincronizar(new.id);
  exception when others then
    raise warning 'Portal del proveedor: no se pudo copiar la compra % (%)', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists proveedor_sincronizar_compra on wms_compras;
create trigger proveedor_sincronizar_compra after insert or update on wms_compras
for each row execute function proveedor_sincronizar_compra();

-- Las líneas de producto cambian el costo por unidad: también se vuelve a copiar la compra.
create or replace function proveedor_sincronizar_item() returns trigger
language plpgsql as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform proveedor_sincronizar(old.compra_id);
    else
      perform proveedor_sincronizar(new.compra_id);
    end if;
  exception when others then
    raise warning 'Portal del proveedor: no se pudo copiar la compra de la línea (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists proveedor_sincronizar_item on wms_compra_items;
create trigger proveedor_sincronizar_item after insert or update or delete on wms_compra_items
for each row execute function proveedor_sincronizar_item();

-- 11) Carga inicial: todas las compras de los proveedores con portal (las abiertas y el historial ya llegado).
do $$
begin
  perform proveedor_sincronizar(c.id)
  from wms_compras c
  join proveedores p on p.activo and lower(btrim(p.nombre_en_compras)) = lower(btrim(coalesce(c.proveedor, '')));
end $$;
