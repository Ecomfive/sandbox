-- Reversa de la 0274: quita la función para agregar productos a una remisión. Lo ya agregado queda como líneas normales de su remisión.
drop function if exists wms_agregar_a_remision(uuid, jsonb, uuid);
