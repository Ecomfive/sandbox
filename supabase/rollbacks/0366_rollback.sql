-- Reversa de 0366: se quitan las semanas (con sus recibos firmados: los PDF quedan en el almacenamiento `despacho-recibos`, que no se borra) y los
-- deliverys.
drop table if exists despacho_semanas;
drop table if exists despacho_deliverys;
notify pgrst, 'reload schema';
