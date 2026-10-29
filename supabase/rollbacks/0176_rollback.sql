-- Reversa de 0176_cuenta_extraccion_dropi_mx.sql: quita la cuenta de proveedor de Dropi México si ningún pedido la usa todavía.
delete from cuentas_extraccion c
using plataformas p, paises pa
where c.plataforma_id = p.id and c.pais_id = pa.id and p.nombre = 'Dropi' and pa.codigo = 'MX' and c.tipo = 'proveedor'
  and not exists (select 1 from staging_ordenes_dropi s where s.cuenta_extraccion_id = c.id);
