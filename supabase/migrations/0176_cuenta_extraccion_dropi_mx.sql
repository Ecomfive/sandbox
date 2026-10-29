-- Cuenta de extracción de Dropi (tipo proveedor) para México (29 oct 2026): sin ella `ingerirPedidos` no guarda los pedidos de México
-- («Falta la cuenta de extracción Dropi proveedor»). Como 0008 para Costa Rica y Panamá. Solo metadata; nunca credenciales.
-- En producción ya se agregó a mano el 29 oct 2026 al cargar México por primera vez: por eso no la duplica.
-- Reversa: supabase/rollbacks/0176_rollback.sql

insert into cuentas_extraccion (plataforma_id, pais_id, tipo, etiqueta)
select p.id, pa.id, 'proveedor', 'Dropi proveedor ' || pa.codigo
from plataformas p, paises pa
where p.nombre = 'Dropi' and pa.codigo = 'MX'
  and not exists (select 1 from cuentas_extraccion c where c.plataforma_id = p.id and c.pais_id = pa.id and c.tipo = 'proveedor');
