-- Cuentas de extracción de Dropi (tipo proveedor) para Costa Rica y Panamá.
-- Solo metadata; las credenciales viven en variables de entorno, nunca aquí.

insert into cuentas_extraccion (plataforma_id, pais_id, tipo, etiqueta)
select p.id, pa.id, 'proveedor', 'Dropi proveedor ' || pa.codigo
from plataformas p, paises pa
where p.nombre = 'Dropi' and pa.codigo in ('CR', 'PA');
