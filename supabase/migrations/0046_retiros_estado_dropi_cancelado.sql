-- "Cancelado" pasa a ser su propio resultado de Dropi, en vez de tratarse igual que
-- "rechazado" (mapearEstadoDropi los unía porque antes daba lo mismo para nosotros): ahora es
-- una de las tres variantes del segundo paso de la barra de pasos de la ficha (Aprobado,
-- Rechazado o Cancelado — el único paso que cambia; los otros tres van siempre).
alter table retiros drop constraint if exists retiros_estado_dropi_check;
alter table retiros add constraint retiros_estado_dropi_check
  check (estado_dropi in ('pendiente', 'aprobado', 'rechazado', 'cancelado'));

alter table dropi_retiros_sin_vincular drop constraint if exists dropi_retiros_sin_vincular_estado_dropi_check;
alter table dropi_retiros_sin_vincular add constraint dropi_retiros_sin_vincular_estado_dropi_check
  check (estado_dropi in ('pendiente', 'aprobado', 'rechazado', 'cancelado'));

-- Fecha en que Dropi reportó el retiro como cancelado, simétrica a fecha_aprobado/fecha_rechazo.
alter table retiros add column if not exists fecha_cancelado_dropi date;
