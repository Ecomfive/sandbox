-- CRM › «Dónde vende»: su propia lista de plataformas, que el equipo crea, renombra y borra desde el selector del chat (29 oct 2026, pedido de
-- Alcides: la lista general de `plataformas` traía tiendas y nombres mal escritos, y es la de Configuración y Retiros, que no se toca). Además, lo
-- que sale de una cuenta vinculada se puede quitar de «Dónde vende» sin desvincular la cuenta (`oculto`). RLS sin políticas (migración 0063).
-- Reversa: supabase/rollbacks/0194_rollback.sql

create table if not exists crm_plataformas_venta (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  creado_en timestamptz not null default now()
);
create unique index if not exists crm_plataformas_venta_nombre on crm_plataformas_venta (lower(btrim(nombre)));
alter table crm_plataformas_venta enable row level security;

-- Para empezar: Dropi y EFFI (más abajo, las que ya se hayan usado en «Dónde vende»).
insert into crm_plataformas_venta (nombre) values ('Dropi'), ('EFFI') on conflict do nothing;

alter table dropshipper_vende_en add column if not exists plataforma_venta_id uuid references crm_plataformas_venta(id) on delete cascade;
alter table dropshipper_vende_en add column if not exists oculto boolean not null default false;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'dropshipper_vende_en' and column_name = 'plataforma_id') then
    insert into crm_plataformas_venta (nombre)
    select distinct p.nombre from dropshipper_vende_en v join plataformas p on p.id = v.plataforma_id
    on conflict do nothing;
    update dropshipper_vende_en v set plataforma_venta_id = c.id
    from plataformas p, crm_plataformas_venta c
    where p.id = v.plataforma_id and lower(btrim(c.nombre)) = lower(btrim(p.nombre)) and v.plataforma_venta_id is null;
    alter table dropshipper_vende_en drop column plataforma_id;
  end if;
end $$;

delete from dropshipper_vende_en where plataforma_venta_id is null;
alter table dropshipper_vende_en alter column plataforma_venta_id set not null;
create unique index if not exists dropshipper_vende_en_unico on dropshipper_vende_en (dropshipper_id, plataforma_venta_id, pais_id);
