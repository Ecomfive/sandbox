-- 0963 · La remesa de plata contra entrega llega al libro de movimientos y, por la cuenta, al banco.
--
-- Una remesa (lo que un mensajero o transportadora devolvió) se asienta en `fin_movimientos` como FLUJO, nunca como
-- ingreso del EERR (la venta ya está en sus órdenes): tipo patrimonial «Cobro contra entrega», `en_eerr = false`,
-- `en_flujo = true`, igual que el pago de Deliverys. Va un movimiento por tienda (suma de sus órdenes) con la cuenta
-- elegida, así la conciliación bancaria (`conc_lineas`/`conc_pares`) lo empareja con el depósito del extracto.
-- Anular la remesa retira sus movimientos, salvo que ya estén conciliados con una línea del banco.

insert into fin_tipos (nombre, seccion, signo, orden)
values ('Cobro contra entrega', 'patrimonial', 1, 830)
on conflict (nombre) do nothing;

alter table ven_cod_remesas add column if not exists cuenta_id uuid references fin_cuentas(id);
alter table ven_cod_remesas add column if not exists en_libro boolean not null default false;

create or replace function ven_remesa_al_libro(p_remesa uuid, p_cuenta uuid)
returns integer language plpgsql as $$
declare
  v_r ven_cod_remesas%rowtype;
  v_tipo uuid;
  v_n integer;
begin
  select * into v_r from ven_cod_remesas where id = p_remesa for update;
  if not found then raise exception 'La remesa no existe.'; end if;
  if v_r.anulada_en is not null then raise exception 'La remesa está anulada.'; end if;
  if v_r.en_libro then raise exception 'La remesa ya está en el libro.'; end if;
  if not exists (select 1 from fin_cuentas where id = p_cuenta and activo) then raise exception 'La cuenta no existe o está inactiva.'; end if;
  select id into v_tipo from fin_tipos where nombre = 'Cobro contra entrega';
  if v_tipo is null then raise exception 'Falta el tipo «Cobro contra entrega» en el libro.'; end if;
  if exists (select 1 from fin_cierres where periodo = date_trunc('month', v_r.fecha)::date and estado = 'cerrado') then
    raise exception 'El mes de la remesa está cerrado en finanzas.';
  end if;

  insert into fin_movimientos (periodo, fecha_registro, unidad_id, tipo_id, descripcion, en_eerr, en_flujo, monto,
                               fecha_servicio, fecha_pago, cuenta_id, origen, origen_clave)
  select date_trunc('month', v_r.fecha)::date, v_r.fecha, o.unidad_id, v_tipo,
         left('Remesa contra entrega' || coalesce(' · ' || v_r.referencia, '') || ' · ' || count(*) || ' órdenes', 200),
         false, true, sum(ro.monto), v_r.fecha, v_r.fecha, p_cuenta, 'remesa_cod', 'remesa:' || v_r.id || ':' || o.unidad_id
  from ven_cod_remesa_ordenes ro
  join ven_ordenes o on o.id = ro.orden_id
  where ro.remesa_id = v_r.id
  group by o.unidad_id
  on conflict (origen_clave) do nothing;
  get diagnostics v_n = row_count;

  update ven_cod_remesas set cuenta_id = p_cuenta, en_libro = true where id = v_r.id;
  return v_n;
end $$;
revoke all on function ven_remesa_al_libro(uuid, uuid) from public;

-- Anular también retira lo que la remesa dejó en el libro; si el banco ya lo emparejó, hay que deshacer eso primero.
create or replace function ven_anular_remesa(p_remesa uuid, p_motivo text, p_usuario text)
returns void language plpgsql as $$
begin
  if p_motivo is null or length(trim(p_motivo)) < 5 then raise exception 'El motivo de la anulación es obligatorio.'; end if;
  perform 1 from ven_cod_remesas where id = p_remesa and anulada_en is null for update;
  if not found then raise exception 'La remesa no existe o ya está anulada.'; end if;
  if exists (
    select 1 from conc_pares p join fin_movimientos m on m.id = p.movimiento_id
    where m.origen = 'remesa_cod' and m.origen_clave like 'remesa:' || p_remesa || ':%'
  ) then
    raise exception 'La remesa ya está conciliada con el banco: deshaz esa conciliación antes de anularla.';
  end if;
  delete from fin_movimientos where origen = 'remesa_cod' and origen_clave like 'remesa:' || p_remesa || ':%';
  update ven_cod_remesas set anulada_en = now(), anulada_por = p_usuario, anulada_motivo = trim(p_motivo), en_libro = false where id = p_remesa;
end $$;
revoke all on function ven_anular_remesa(uuid, text, text) from public;

comment on column ven_cod_remesas.en_libro is 'Portal AF4 360°: la remesa ya se asentó en fin_movimientos (solo flujo, cuenta_id).';
