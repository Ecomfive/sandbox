-- Permite asignar cada movimiento bancario a la plataforma que lo generó,
-- necesario para poder conciliar por plataforma (no solo por país).
alter table movimientos_bancarios
  add column plataforma_id uuid references plataformas(id);

-- Bucket privado para los extractos crudos que se suben. El acceso pasa
-- siempre por el service role (server actions), no por el cliente anon.
insert into storage.buckets (id, name, public)
values ('extractos-bancarios', 'extractos-bancarios', false)
on conflict (id) do nothing;
