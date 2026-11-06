<<<<<<< HEAD
-- Reversa de 0241_actividad_dispositivo.sql: borra de qué dispositivo vino cada minuto. Los minutos se conservan.
alter table actividad_minutos drop column if exists dispositivo;
=======
-- Reversa de 0241_recepcion_compras.sql. Lo recibido se queda en el inventario y en sus compras: solo se quita la función, y el origen 'compra' sigue permitido mientras
-- haya movimientos con él. La bodega vuelve a llamarse Boxfull.

drop function if exists wms_recibir_compra(uuid, uuid, jsonb, uuid);

update wms_bodegas b set nombre = 'Boxfull'
from paises p
where p.id = b.pais_id and p.codigo = 'CR' and b.codigo = 'boxfull';

notify pgrst, 'reload schema';
>>>>>>> origin/main
