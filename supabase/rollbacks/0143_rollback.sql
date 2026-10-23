-- Reversa de 0143: vuelve el proveedor a «Chin». Lo escrito en comentarios y novedades vuelve solo donde dice «Shen Zhen».
update proveedores set nombre = 'Chin', nombre_en_compras = 'Chin' where nombre_en_compras = 'Shen Zhen';
update wms_compras set proveedor = 'Chin' where proveedor = 'Shen Zhen';
update wms_compras set agente_envio = 'Chin' where agente_envio = 'Shen Zhen';
update wms_rutas_envio set agente = 'Chin' where agente = 'Shen Zhen';
update proveedor_usuarios set nombre = regexp_replace(nombre, '\mShen Zhen\M', 'Chin', 'g') where nombre ~ '\mShen Zhen\M';
update wms_compra_eventos set valor_antes = 'Chin' where valor_antes = 'Shen Zhen';
update wms_compra_eventos set valor_despues = 'Chin' where valor_despues = 'Shen Zhen';
update wms_compra_comentarios set texto = regexp_replace(texto, '\mShen Zhen\M', 'Chin', 'g') where texto ~ '\mShen Zhen\M';
update proveedor_novedades set texto = regexp_replace(texto, '\mShen Zhen\M', 'Chin', 'g') where texto ~ '\mShen Zhen\M';
update proveedor_novedades set detalle = regexp_replace(detalle, '\mShen Zhen\M', 'Chin', 'g') where detalle ~ '\mShen Zhen\M';
