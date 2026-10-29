-- Reversa de 0191_crm_etiquetas_desde_cero.sql: devuelve a cada dropshipper las etiquetas que tenía (se suman a las que tenga ahora) y
-- borra la copia.
update dropshippers d
set etiquetas = (select array(select distinct unnest(d.etiquetas || r.etiquetas)))
from dropshippers_etiquetas_respaldo r
where r.dropshipper_id = d.id;

drop table if exists dropshippers_etiquetas_respaldo;
