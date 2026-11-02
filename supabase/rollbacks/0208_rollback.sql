-- Reversa de 0208_fulfillment_por_pais.sql: quita el fulfillment de cada país (el código vuelve a usar $1.50 solo en Panamá).
-- No devuelve el fulfillment de antes a las publicaciones de Costa Rica: el valor anterior de cada una quedó en su Actividad
-- (autor «Fulfillment del país»).

alter table paises drop constraint if exists paises_fulfillment_check;
alter table paises drop column if exists fulfillment;
