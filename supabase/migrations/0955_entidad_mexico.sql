-- Portal AF4 360° › México como entidad del grupo (peso mexicano). Se suma a Panamá (USD) y Costa Rica (CRC) en los
-- selectores de entidad y moneda; el tipo de cambio de cada mes se completa como el del colón (`fin_tipos_cambio_completar`).
-- Se puede correr más de una vez.

insert into fin_entidades (codigo, razon_social, moneda, orden) values ('MX', 'México', 'MXN', 30)
on conflict (codigo) do nothing;

update fin_entidades e set pais_id = p.id from paises p where e.pais_id is null and p.codigo = e.codigo;
