-- Corregir una remisión con autorización (pedido de Hernán, 6 nov 2026). Nadie corrige por su cuenta: quien necesita cambiar lo recibido o anular lo que sigue en camino lo **pide** con
-- su motivo y otra persona lo **autoriza**; recién entonces cambia. Autorizan Hernán y Alcides en todos los países, Dinora en Panamá y Yanixia en Costa Rica (`wms_autorizadores_remision`).
-- Nunca autoriza quien lo pidió. Reversa: supabase/rollbacks/0234_rollback.sql

create table if not exists wms_autorizadores_remision (
  id uuid primary key default uuid_v7(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  -- null = en todos los países.
  pais_id uuid references paises(id) on delete cascade
);
create unique index if not exists wms_autorizadores_remision_unico on wms_autorizadores_remision (perfil_id, coalesce(pais_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table wms_autorizadores_remision enable row level security;

insert into wms_autorizadores_remision (perfil_id, pais_id)
select p.id, null from perfiles p where p.nombre in ('Hernán Betancourt', 'Alcides Andrade') and p.activo
on conflict do nothing;
insert into wms_autorizadores_remision (perfil_id, pais_id)
select u.id, p.id from perfiles u join paises p on p.codigo = 'PA' where u.nombre = 'Dinora Gomez' and u.activo
on conflict do nothing;
insert into wms_autorizadores_remision (perfil_id, pais_id)
select u.id, p.id from perfiles u join paises p on p.codigo = 'CR' where u.nombre = 'Yanixia' and u.activo
on conflict do nothing;

-- Una línea anulada: sus unidades volvieron a la bodega de origen.
alter table wms_envios_dropi drop constraint if exists wms_envios_dropi_estado_check;
alter table wms_envios_dropi add constraint wms_envios_dropi_estado_check check (estado in ('en_camino', 'recibido', 'anulado'));

create table if not exists wms_correcciones_remision (
  id uuid primary key default uuid_v7(),
  envio_id uuid not null references wms_envios_dropi(id) on delete restrict,
  -- «recibida»: cambiar lo que se anotó que llegó. «anular»: la línea sigue en camino y sus unidades vuelven a la bodega.
  tipo text not null check (tipo in ('recibida', 'anular')),
  recibida_antes integer,
  recibida_nueva integer check (recibida_nueva is null or recibida_nueva >= 0),
  check ((tipo = 'recibida') = (recibida_nueva is not null)),
  motivo text not null check (length(btrim(motivo)) >= 5),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'autorizada', 'rechazada')),
  solicitante_id uuid references perfiles(id) on delete set null,
  solicitante_nombre text not null,
  -- Quiénes pueden resolverla: los autorizadores del país, menos quien la pidió.
  autoriza_a uuid[] not null default '{}',
  resuelta_por uuid references perfiles(id) on delete set null,
  resuelta_por_nombre text,
  resuelta_en timestamptz,
  nota_resolucion text,
  creado_en timestamptz not null default now()
);
-- Una sola petición pendiente por línea.
create unique index if not exists wms_correcciones_remision_pendiente on wms_correcciones_remision (envio_id) where estado = 'pendiente';
create index if not exists wms_correcciones_remision_envio on wms_correcciones_remision (envio_id, creado_en desc);
alter table wms_correcciones_remision enable row level security;

-- La notificación que le llega a quien autoriza y a quien lo pidió.
alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision'));

-- Resuelve una petición. Todo en una transacción: el cambio de la línea y, al anular, las unidades de vuelta a la bodega, del mismo lote del que salieron.
create or replace function wms_resolver_correccion_remision(
  p_correccion uuid,
  p_autorizar boolean,
  p_nota text,
  p_usuario uuid,
  p_nombre text
) returns void
language plpgsql as $$
declare
  c record;
  e record;
  m record;
  v_devueltas integer := 0;
begin
  select * into c from wms_correcciones_remision where id = p_correccion for update;
  if not found then raise exception 'La petición ya no existe.'; end if;
  if c.estado <> 'pendiente' then raise exception 'Esa petición ya se resolvió.'; end if;
  if c.solicitante_id = p_usuario then raise exception 'No puedes autorizar tu propia petición.'; end if;
  if not (p_usuario = any (c.autoriza_a)) then raise exception 'No puedes resolver esta petición.'; end if;
  if not p_autorizar and coalesce(btrim(p_nota), '') = '' then raise exception 'Escribe por qué la rechazas.'; end if;

  if p_autorizar then
    select * into e from wms_envios_dropi where id = c.envio_id for update;
    if c.tipo = 'recibida' then
      if e.estado <> 'recibido' then raise exception 'Esa línea ya no está recibida.'; end if;
      update wms_envios_dropi
         set recibida = c.recibida_nueva,
             motivo_diferencia = case when c.recibida_nueva = e.enviada then null else c.motivo end
       where id = e.id;
    else
      if e.estado <> 'en_camino' then raise exception 'Esa línea ya no sigue en camino: no se puede anular.'; end if;
      for m in
        select lote_id, abs((cambios ->> 'fisico')::integer) as cantidad
          from wms_movimientos
         where sku_maestro_id = e.sku_maestro_id and bodega_id = e.bodega_origen_id and origen = 'envio_dropi' and tipo = 'salida' and referencia = e.referencia
      loop
        perform wms_registrar_movimiento(e.sku_maestro_id, e.bodega_origen_id, 'entrada', m.cantidad, null, 'envio_dropi', e.referencia, 'Remisión anulada: ' || c.motivo, p_usuario, m.lote_id);
        v_devueltas := v_devueltas + m.cantidad;
      end loop;
      if v_devueltas <> e.enviada then
        raise exception 'No se encontraron las % unidades de esa salida: revísalo antes de anular.', e.enviada;
      end if;
      update wms_envios_dropi set estado = 'anulado' where id = e.id;
    end if;
  end if;

  update wms_correcciones_remision
     set estado = case when p_autorizar then 'autorizada' else 'rechazada' end,
         resuelta_por = p_usuario, resuelta_por_nombre = p_nombre, resuelta_en = now(), nota_resolucion = nullif(btrim(p_nota), '')
   where id = c.id;
end;
$$;
