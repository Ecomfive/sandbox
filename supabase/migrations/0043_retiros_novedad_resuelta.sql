-- Nuevo estado: al resolver una novedad (botón "Resolver" de su sección), el retiro ya no vuelve a
-- "abierto" — queda marcado aparte, sin seguir el flujo normal de conciliación (no cuenta como
-- pendiente ni como conciliado en la barra de pasos ni en los filtros).
alter table retiros drop constraint if exists retiros_estado_check;
alter table retiros add constraint retiros_estado_check
  check (estado in ('abierto', 'cancelado', 'novedad', 'cerrado', 'novedad_resuelta'));

-- `fecha_decision` se agregó para un paso "Decisión" de la barra de pasos que ya no existe (se quitó:
-- duplicaba el dato "Estado en Dropi" de la ficha). Si llegaste a correr esa versión de la migración,
-- esto la deja limpia; si no, no hace nada.
alter table retiros drop column if exists fecha_decision;
