-- Numeracion de cuentas de retiro, para identificarlas rapido (Cuenta 1, Cuenta 2, ...).
alter table cuentas_retiro add column if not exists numero integer;

-- Numera las cuentas que ya existian, por pais, en el orden en que se crearon.
with numeradas as (
  select id, row_number() over (partition by pais_id order by creado_en) as n
  from cuentas_retiro
  where numero is null
)
update cuentas_retiro c set numero = numeradas.n
from numeradas where numeradas.id = c.id;

-- Comision sugerida: ahora puede ser porcentaje, monto fijo, o los dos juntos (ej. 2.5% + $3).
alter table cuentas_retiro
  add column if not exists comision_porcentaje numeric(10, 2),
  add column if not exists comision_monto_fijo numeric(10, 2);

update cuentas_retiro set comision_porcentaje = comision_valor where comision_tipo = 'porcentaje';
update cuentas_retiro set comision_monto_fijo = comision_valor where comision_tipo = 'monto_fijo';

alter table cuentas_retiro drop column if exists comision_valor;

alter table cuentas_retiro drop constraint if exists cuentas_retiro_comision_tipo_check;
alter table cuentas_retiro add constraint cuentas_retiro_comision_tipo_check
  check (comision_tipo in ('porcentaje', 'monto_fijo', 'ambos'));
