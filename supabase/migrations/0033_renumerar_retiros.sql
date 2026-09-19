-- CORRECCION DE DATOS (correr una sola vez, DESPUES de 0032): renumera los retiros ya
-- creados en secuencia 1, 2, 3... sin huecos, respetando el orden en que se crearon.
-- Los huecos venian de abrir la ficha de crear sin guardar (cada apertura gastaba un numero).
--
-- CUIDADO: el correlativo es el que se escribe en el concepto del retiro en Dropi (#0007) y con
-- el que se concilia. Si algun numero viejo ya se escribio en Dropi, ese retiro dejara de
-- coincidir. Por eso este script se detiene si algun retiro ya esta vinculado con Dropi.
-- Antes de correrlo, mira el cambio que haria con la consulta de vista previa que acompana a este
-- archivo (o pidesela a quien lo preparo).

do $$
begin
  if exists (select 1 from public.retiros where dropi_id is not null) then
    raise exception 'Hay retiros ya vinculados con Dropi: renumerarlos rompe la conciliacion. No se cambio nada.';
  end if;
end $$;

-- Dos pasos (primero a negativos y luego a positivos) para no chocar con la restriccion de
-- numero unico mientras se actualiza fila por fila.
with orden as (
  select id, row_number() over (order by numero_correlativo, fecha, id) as nuevo
  from public.retiros
)
update public.retiros r
set numero_correlativo = -orden.nuevo
from orden
where r.id = orden.id;

update public.retiros set numero_correlativo = -numero_correlativo where numero_correlativo < 0;
