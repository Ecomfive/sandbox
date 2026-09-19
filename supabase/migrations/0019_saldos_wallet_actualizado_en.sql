-- Fecha y hora de la ultima actualizacion de cada saldo de wallet.
-- saldos_wallet se escribe con upsert por (pais, plataforma, fecha): si el
-- saldo se actualiza varias veces el mismo dia (por ejemplo desde el boton
-- de Dropi), creado_en conserva la hora de la primera vez. actualizado_en
-- se refresca en cada UPDATE, incluido el que hace el upsert al chocar.

alter table saldos_wallet add column actualizado_en timestamptz not null default now();

-- Los saldos existentes toman su hora de creacion como mejor aproximacion.
update saldos_wallet set actualizado_en = creado_en;

create or replace function marcar_actualizado_en() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger saldos_wallet_actualizado_en
before update on saldos_wallet
for each row execute function marcar_actualizado_en();
