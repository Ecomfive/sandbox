-- Fecha en que Dropi tomó su decisión (aprobó o rechazó) sobre el retiro — paso "Decisión" de la
-- barra de pasos de la ficha (antes solo se mostraba la etiqueta, sin fecha). La pone
-- scripts/dropi-ingerir-retiros.ts cada vez que cambia estado_dropi a aprobado o rechazado; queda
-- null mientras el retiro sigue pendiente de que Dropi decida.
alter table retiros add column if not exists fecha_decision date;

-- Nuevo estado: al resolver una novedad (botón "Resolver" de su sección), el retiro ya no vuelve a
-- "abierto" — queda marcado aparte, sin seguir el flujo normal de conciliación (no cuenta como
-- pendiente ni como conciliado en la barra de pasos ni en los filtros).
alter table retiros drop constraint if exists retiros_estado_check;
alter table retiros add constraint retiros_estado_check
  check (estado in ('abierto', 'cancelado', 'novedad', 'cerrado', 'novedad_resuelta'));
