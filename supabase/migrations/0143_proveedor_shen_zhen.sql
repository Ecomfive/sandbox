-- El proveedor «Chin» se llama Shen Zhen (pedido de Hernán, 23 oct 2026): su nombre bien escrito, en los datos y no solo en las
-- pantallas. El orden importa: primero `proveedores` (el disparador del espejo reconoce las compras por `nombre_en_compras`) y después
-- las compras, las rutas de envío y lo escrito en la actividad. Se puede correr de nuevo sin efecto. Las migraciones anteriores no se
-- tocan (ya corrieron). Reversa: supabase/rollbacks/0143_rollback.sql

-- 1) El proveedor con portal.
update proveedores
set nombre = 'Shen Zhen', nombre_en_compras = 'Shen Zhen'
where lower(btrim(nombre_en_compras)) = 'chin' or lower(btrim(nombre)) = 'chin';

-- 2) Las compras: proveedor y agente de envío.
update wms_compras set proveedor = 'Shen Zhen' where lower(btrim(proveedor)) = 'chin';
update wms_compras set agente_envio = 'Shen Zhen' where lower(btrim(agente_envio)) = 'chin';

-- 3) Las rutas de envío: el agente.
update wms_rutas_envio set agente = 'Shen Zhen' where lower(btrim(agente)) = 'chin';

-- 4) Las cuentas del portal (el nombre de la cuenta).
update proveedor_usuarios set nombre = regexp_replace(nombre, '\mChin\M', 'Shen Zhen', 'g') where nombre ~ '\mChin\M';

-- 5) Lo escrito: el historial de cambios del proveedor y del agente de envío, los comentarios de la actividad y las novedades del portal.
update wms_compra_eventos set valor_antes = 'Shen Zhen' where valor_antes = 'Chin';
update wms_compra_eventos set valor_despues = 'Shen Zhen' where valor_despues = 'Chin';
update wms_compra_comentarios set texto = regexp_replace(texto, '\mChin\M', 'Shen Zhen', 'g') where texto ~ '\mChin\M';
update proveedor_novedades set texto = regexp_replace(texto, '\mChin\M', 'Shen Zhen', 'g') where texto ~ '\mChin\M';
update proveedor_novedades set detalle = regexp_replace(detalle, '\mChin\M', 'Shen Zhen', 'g') where detalle ~ '\mChin\M';
