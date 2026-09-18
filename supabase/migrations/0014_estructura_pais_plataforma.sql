-- Modela la jerarquia pais -> tipo de operacion (proveeduria / tienda) -> plataforma
-- que definio el negocio (reunion con Alcides): cada pais se divide en operacion de
-- proveeduria (Dropi, Drog, EFI, Dynamic 5 en Costa Rica) y operacion de tiendas
-- (Offerfy, Kenku, Nubo, tienda con Jorge en Costa Rica). Por ahora solo Dropi tiene
-- datos reales; el resto de plataformas quedan registradas para mostrarse como
-- "Pronto" en la navegacion hasta que se conecten.

alter table plataformas
  add column tipo_operacion text not null default 'proveeduria'
    check (tipo_operacion in ('proveeduria', 'tienda'));

alter table paises
  add column modelo_operacion text not null default 'propio'
    check (modelo_operacion in ('propio', 'fulfillment_externo')),
  add column socio_fulfillment text;

update paises set modelo_operacion = 'fulfillment_externo', socio_fulfillment = 'Boxful' where codigo = 'CR';
update paises set modelo_operacion = 'propio' where codigo = 'PA';

insert into plataformas (nombre, tipo_operacion) values
  ('Drog', 'proveeduria'),
  ('Dynamic 5', 'proveeduria'),
  ('Offerfy', 'tienda'),
  ('Kenku', 'tienda'),
  ('Nubo', 'tienda'),
  ('Tienda con Jorge', 'tienda')
on conflict (nombre) do nothing;

-- Que plataformas aplican a cada pais, y cuales ya tienen datos reales conectados.
create table pais_plataformas (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  plataforma_id uuid not null references plataformas(id),
  tiene_datos boolean not null default false,
  unique (pais_id, plataforma_id)
);

alter table pais_plataformas enable row level security;
create policy "authenticated read/write" on pais_plataformas for all using (auth.role() = 'authenticated');

-- Dropi ya esta conectado y con datos reales en ambos paises.
insert into pais_plataformas (pais_id, plataforma_id, tiene_datos)
select p.id, pl.id, true
from paises p, plataformas pl
where pl.nombre = 'Dropi' and p.codigo in ('CR', 'PA');

-- Resto de plataformas de proveeduria y tiendas de Costa Rica, aun sin conectar.
insert into pais_plataformas (pais_id, plataforma_id, tiene_datos)
select p.id, pl.id, false
from paises p, plataformas pl
where p.codigo = 'CR'
  and pl.nombre in ('Drog', 'EFI', 'Dynamic 5', 'Offerfy', 'Kenku', 'Nubo', 'Tienda con Jorge');
