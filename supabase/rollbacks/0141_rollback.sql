alter table proveedor_pedidos drop column if exists llegada_proveedor;
delete from proveedor_pagos where origen = 'proveedor';
alter table proveedor_pagos drop column if exists registrado_por;
alter table proveedor_pagos drop constraint if exists proveedor_pagos_origen_check;
alter table proveedor_pagos add constraint proveedor_pagos_origen_check check (origen in ('aviso', 'hoja'));
