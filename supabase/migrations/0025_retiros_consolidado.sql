-- Bandera manual de seguimiento (independiente del estado del retiro): si ya
-- se consolido/reviso o sigue pendiente. Se puede cambiar libremente desde
-- la tabla de Retiros.
alter table retiros add column if not exists consolidado boolean not null default false;
