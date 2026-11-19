-- Reversa de 0330: quita los ejemplos que sembró «Sistema» para Costa Rica y deja su configuración como estaba antes (sin distinguir zona ni etiquetas). Las instrucciones solo se quitan si siguen siendo las de la migración.
delete from confirmacion_ia_ejemplos e using paises p
where e.pais_id = p.id and p.codigo = 'CR' and e.creado_por_nombre = 'Sistema' and e.origen = 'manual';
update confirmacion_ia_config c set instrucciones = null
where c.pais_id = (select id from paises where codigo = 'CR') and c.instrucciones like 'REGLAS DE ZONA DE COSTA RICA (confirmadas por el equipo):%';
update confirmacion_ia_config c set distingue_zona = false, etiqueta_ciudad = null, etiqueta_interior = null
where c.pais_id = (select id from paises where codigo = 'CR');
notify pgrst, 'reload schema';
