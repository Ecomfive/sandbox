-- Reversa de 0213_fulfillment_por_plataforma.sql. Las publicaciones de Costa Rica conservan el fulfillment en colones (el arreglo era correcto);
-- para volver al valor de antes, ver su Actividad («Fulfillment del país»).
alter table pais_plataformas drop constraint if exists pais_plataformas_fulfillment_check;
alter table pais_plataformas drop column if exists fulfillment;
delete from pais_plataformas pp using paises p, plataformas pl
where pp.pais_id = p.id and pp.plataforma_id = pl.id and p.codigo = 'MX' and pl.nombre = 'Dropi' and not pp.tiene_datos and not pp.disponible_para_retiro;
