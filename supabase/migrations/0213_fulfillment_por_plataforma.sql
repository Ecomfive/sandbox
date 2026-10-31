-- Fulfillment por país y plataforma (pedido de Alcides, 31 oct 2026). Antes había un solo fulfillment por país (`paises.fulfillment`, migración
-- 0208, que se cambiaba en Bodegas); ahora cada plataforma de cada país tiene el suyo en Configuración (`pais_plataformas.fulfillment`) **con su
-- moneda** (`fulfillment_moneda`: la que factura el proveedor, dólares o la del país). El de Dropi es el que usan las publicaciones de Gestión de IDs
-- Dropi: tal cual si está en la moneda de las publicaciones; si no, pasado con el tipo de cambio del día (`fulfillmentDePais`,
-- src/lib/publicaciones/fulfillment-pais.ts). `paises.fulfillment` queda solo para cuando falta esta migración.
--
-- Arreglo de Costa Rica: la 0208 puso 2 en las publicaciones de Costa Rica, cuyos montos están en colones, así que se restaban 2 colones y el
-- margen salía casi 100 %. Aquí esos $2 pasan a colones con el tipo de cambio más reciente guardado (`tipos_cambio`), con el valor de antes en la
-- Actividad de cada publicación. Sin tipo de cambio de colones guardado no se toca nada (se corrige al guardar el fulfillment en Configuración).
--
-- Costa Rica paga y cobra en colones (Alcides, 31 oct 2026): su fulfillment de Dropi queda en colones (los $2 al tipo de cambio más reciente; se
-- corrige en Configuración con el monto exacto) y las plataformas de Costa Rica y México sin fulfillment arrancan en la moneda del país.
--
-- México: se le agrega Dropi como plataforma del país (no lo tenía), sin marcarla con datos ni para retiros, para poder ponerle su fulfillment.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0213_rollback.sql

alter table pais_plataformas add column if not exists fulfillment numeric(12, 2);
alter table pais_plataformas add column if not exists fulfillment_moneda text not null default 'USD';
alter table pais_plataformas drop constraint if exists pais_plataformas_fulfillment_check;
alter table pais_plataformas add constraint pais_plataformas_fulfillment_check check (fulfillment is null or (fulfillment >= 0 and fulfillment < 100000));
alter table pais_plataformas drop constraint if exists pais_plataformas_fulfillment_moneda_check;
alter table pais_plataformas add constraint pais_plataformas_fulfillment_moneda_check check (fulfillment_moneda ~ '^[A-Z]{3}$');

insert into pais_plataformas (pais_id, plataforma_id, tiene_datos, disponible_para_retiro)
select p.id, pl.id, false, false
from paises p, plataformas pl
where p.codigo = 'MX' and pl.nombre = 'Dropi'
on conflict (pais_id, plataforma_id) do nothing;

-- El fulfillment de cada país pasa a su fila de Dropi, en dólares (como se escribió en Bodegas).
update pais_plataformas pp set fulfillment = p.fulfillment, fulfillment_moneda = 'USD'
from paises p, plataformas pl
where pp.pais_id = p.id and pp.plataforma_id = pl.id and pl.nombre = 'Dropi'
  and p.fulfillment is not null and pp.fulfillment is null;

-- Costa Rica: los $2 de sus publicaciones, a colones.
with tasa as (select por_usd from tipos_cambio where moneda = 'CRC' order by fecha desc limit 1),
cr as (
  select p.id, x.fulfillment as usd, round(x.fulfillment * t.por_usd) as colones, p.fulfillment as antes
  from dropi_publicaciones p
  join paises x on x.id = p.pais_id
  cross join tasa t
  where x.codigo = 'CR' and x.fulfillment is not null and p.fulfillment = x.fulfillment
)
insert into dropi_publicacion_comentarios (publicacion_id, autor, texto)
select id, 'Fulfillment del país',
  'Fulfillment: ' || to_char(antes, 'FM999999990.00') || ' → ₡' || to_char(colones, 'FM999999990') || ' (los US$' || to_char(usd, 'FM990.00') ||
  ' de Costa Rica en colones: antes se restaban como colones)'
from cr;

with tasa as (select por_usd from tipos_cambio where moneda = 'CRC' order by fecha desc limit 1)
update dropi_publicaciones p set fulfillment = round(x.fulfillment * t.por_usd)
from paises x, tasa t
where x.id = p.pais_id and x.codigo = 'CR' and x.fulfillment is not null and p.fulfillment = x.fulfillment;

-- La fila de Dropi de Costa Rica, en colones (el mismo monto que acaban de tomar sus publicaciones).
with tasa as (select por_usd from tipos_cambio where moneda = 'CRC' order by fecha desc limit 1)
update pais_plataformas pp set fulfillment = round(pp.fulfillment * t.por_usd), fulfillment_moneda = 'CRC'
from paises x, plataformas pl, tasa t
where pp.pais_id = x.id and pp.plataforma_id = pl.id and x.codigo = 'CR' and pl.nombre = 'Dropi'
  and pp.fulfillment is not null and pp.fulfillment_moneda = 'USD';

-- Sin fulfillment todavía: en la moneda del país.
update pais_plataformas pp set fulfillment_moneda = case x.codigo when 'CR' then 'CRC' when 'MX' then 'MXN' end
from paises x
where pp.pais_id = x.id and x.codigo in ('CR', 'MX') and pp.fulfillment is null and pp.fulfillment_moneda = 'USD';
