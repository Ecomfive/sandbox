-- CRM: el «Tipo de cliente» de cada dropshipper es Rookie, VIP o Black (29 oct 2026, pedido de Alcides). Se guarda en `dropshippers.nivel`:
-- `regular` = Rookie, `vip` = VIP y `black` (nuevo, por encima de VIP). Los que decían «Nuevo» pasan a Rookie.
-- Reversa: supabase/rollbacks/0195_rollback.sql

do $$
declare r record;
begin
  -- Quita el check viejo de `nivel` (nuevo, regular, vip), se llame como se llame.
  for r in
    select c.conname from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'dropshippers' and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%nivel%'
  loop
    execute format('alter table dropshippers drop constraint %I', r.conname);
  end loop;
end $$;

update dropshippers set nivel = 'regular' where nivel = 'nuevo' or nivel is null;
alter table dropshippers alter column nivel set default 'regular';
alter table dropshippers add constraint dropshippers_nivel_check check (nivel in ('regular', 'vip', 'black'));
