-- La remisión como documento (pedido de Hernán, 6 nov 2026): el papel que va con la carga a Dropi. Una remisión lleva su número y varios productos; cada
-- producto sigue siendo una línea de `wms_envios_dropi` (lo enviado, lo recibido y su motivo). Dropi no recibe nada del sistema: el papel lo lleva la carga.

create sequence if not exists wms_remisiones_numero_seq;

create table if not exists wms_remisiones (
  id uuid primary key default uuid_v7(),
  numero integer not null unique default nextval('wms_remisiones_numero_seq'),
  bodega_origen_id uuid not null references wms_bodegas(id),
  bodega_destino_id uuid not null references wms_bodegas(id),
  -- Transportista, placa o lo que haya que decir de la carga: sale en el papel.
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
alter sequence wms_remisiones_numero_seq owned by wms_remisiones.numero;
alter table wms_remisiones enable row level security;

alter table wms_envios_dropi add column if not exists remision_id uuid references wms_remisiones(id);
create index if not exists wms_envios_dropi_remision on wms_envios_dropi (remision_id);

-- Crea la remisión con todas sus líneas o ninguna: si un producto no tiene stock, no sale nada. `p_items` = [{ sku, cantidad, lote? }].
create or replace function wms_crear_remision(
  p_desde uuid,
  p_hacia uuid,
  p_items jsonb,
  p_notas text default null,
  p_usuario uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_id uuid;
  v_numero integer;
  v_codigo text;
  v_item jsonb;
  v_envio uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La remisión no tiene productos.';
  end if;
  if (select count(distinct x ->> 'sku') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Un producto está dos veces en la remisión.';
  end if;
  insert into wms_remisiones (bodega_origen_id, bodega_destino_id, notas, creado_por)
  values (p_desde, p_hacia, nullif(btrim(p_notas), ''), p_usuario)
  returning id, numero into v_id, v_numero;
  v_codigo := 'REM-' || lpad(v_numero::text, 4, '0');
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_envio := wms_enviar_a_externa(
      (v_item ->> 'sku')::uuid, p_desde, p_hacia, (v_item ->> 'cantidad')::integer, nullif(v_item ->> 'lote', '')::uuid, v_codigo, p_usuario
    );
    update wms_envios_dropi set remision_id = v_id where id = v_envio;
  end loop;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;
