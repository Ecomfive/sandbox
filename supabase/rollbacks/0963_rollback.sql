delete from fin_movimientos where origen = 'remesa_cod' and not exists (select 1 from conc_pares p where p.movimiento_id = fin_movimientos.id);
drop function if exists ven_remesa_al_libro(uuid, uuid);
create or replace function ven_anular_remesa(p_remesa uuid, p_motivo text, p_usuario text)
returns void language plpgsql as $$
begin
  if p_motivo is null or length(trim(p_motivo)) < 5 then raise exception 'El motivo de la anulación es obligatorio.'; end if;
  perform 1 from ven_cod_remesas where id = p_remesa and anulada_en is null for update;
  if not found then raise exception 'La remesa no existe o ya está anulada.'; end if;
  update ven_cod_remesas set anulada_en = now(), anulada_por = p_usuario, anulada_motivo = trim(p_motivo) where id = p_remesa;
end $$;
revoke all on function ven_anular_remesa(uuid, text, text) from public;
alter table ven_cod_remesas drop column if exists en_libro;
alter table ven_cod_remesas drop column if exists cuenta_id;
-- El tipo «Cobro contra entrega» se deja (inofensivo); bórralo a mano si no tiene movimientos.
