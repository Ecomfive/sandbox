-- Portal AF4 360°: la foto semanal de la proyección de caja guarda su caja mínima proyectada y la semana en que cae, para
-- que la alerta diaria «caja proyectada bajo el mínimo» (tareas programadas, 0134) la lea sin rehacer la proyección.
-- Se puede correr dos veces.

alter table fin_proyeccion_fotos add column if not exists saldo_minimo numeric(14, 2);
alter table fin_proyeccion_fotos add column if not exists fecha_minimo date;

comment on column fin_proyeccion_fotos.saldo_minimo is 'Caja final más baja de las 13 semanas del escenario base al tomar la foto.';
comment on column fin_proyeccion_fotos.fecha_minimo is 'Lunes de la semana en que cae esa caja mínima.';
