-- Portal del proveedor: Chin anota él mismo los pagos que recibe (23 oct 2026, decisión de Hernán). Ecomfive ya no avisa pagos desde
-- el sistema: le manda el comprobante por privado, Chin lo anota en su «Registro de pagos» (las columnas de su hoja «payment record»)
-- y Ecomfive actualiza Compras a mano. Chin también anota su fecha de llegada («Arrival Time»), aparte de la que marca Ecomfive en la
-- compra: cada uno marca la suya.

-- Los pagos que anota el proveedor (origen «proveedor») y quién de su cuenta los anotó.
alter table proveedor_pagos drop constraint if exists proveedor_pagos_origen_check;
alter table proveedor_pagos add constraint proveedor_pagos_origen_check check (origen in ('aviso', 'hoja', 'proveedor'));
alter table proveedor_pagos add column if not exists registrado_por uuid references proveedor_usuarios(id) on delete set null;

-- La llegada según el proveedor. El disparador del espejo (`proveedor_sincronizar`) no la toca: es solo suya.
alter table proveedor_pedidos add column if not exists llegada_proveedor date;
