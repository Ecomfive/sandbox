-- Guarda la fecha+hora exacta que reporta Dropi para cada orden (hoy solo
-- se guardaba la fecha, sin hora, en `fecha`). Se guarda como texto tal cual
-- la manda Dropi (sin zona horaria) para no arriesgar un corrimiento de dia
-- al convertirla a timestamptz con una zona horaria equivocada; total y
-- Carmen solo necesitan mostrarla, no hacer aritmetica de fechas con ella.

alter table ordenes add column fecha_hora text;

update ordenes o
set fecha_hora = s.payload->>'created_at'
from staging_ordenes_dropi s
where (s.payload->>'id') = o.referencia_externa
  and o.fecha_hora is null;
