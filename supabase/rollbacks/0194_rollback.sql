-- Reversa de 0194_crm_plataformas_venta.sql: vuelve «Dónde vende» a la lista general de plataformas (lo que no tenga una igual se pierde).
alter table dropshipper_vende_en add column if not exists plataforma_id uuid references plataformas(id);
update dropshipper_vende_en v set plataforma_id = p.id
from crm_plataformas_venta c, plataformas p
where c.id = v.plataforma_venta_id and lower(btrim(p.nombre)) = lower(btrim(c.nombre));
delete from dropshipper_vende_en where plataforma_id is null or oculto;
drop index if exists dropshipper_vende_en_unico;
alter table dropshipper_vende_en drop column if exists plataforma_venta_id;
alter table dropshipper_vende_en drop column if exists oculto;
alter table dropshipper_vende_en alter column plataforma_id set not null;
drop table if exists crm_plataformas_venta;
