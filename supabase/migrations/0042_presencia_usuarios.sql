-- Quién está usando la app ahora mismo, para Usuarios y roles: cada sesión abierta manda un "estoy aquí"
-- cada tanto (ver `LatidoPresencia`) mientras la pestaña está visible, y esto guarda cuándo fue la última vez.
alter table perfiles add column if not exists ultima_actividad_en timestamptz;
