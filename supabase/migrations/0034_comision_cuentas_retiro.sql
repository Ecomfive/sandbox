-- Cada cuenta de retiro puede tener una comision configurada (porcentaje o monto fijo,
-- nunca ambas) para sugerirla al crear un retiro nuevo con esa cuenta. Es solo una
-- sugerencia al crear: cambiarla despues no toca los retiros ya creados, porque estos
-- guardan su propia comision en su propia fila.

alter table cuentas_retiro
  add column if not exists comision_tipo text check (comision_tipo in ('porcentaje', 'monto_fijo')),
  add column if not exists comision_valor numeric(10, 2);
