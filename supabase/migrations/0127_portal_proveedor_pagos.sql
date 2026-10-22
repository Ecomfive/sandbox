-- Portal del proveedor, fase 4 (plan en PORTAL-PROVEEDOR.md): los pagos a Chin.
--
-- Lo pagado vive aquí, no en los campos de pago de la compra (decidido el 21 oct 2026: en Compras «Fecha de Pago (1)» es la fecha
-- en que vence). Cada pago es de una cuota (anticipo o saldo) de un pedido del espejo o de una fila del historial de las hojas de Chin
-- que no tiene compra en el sistema. Entra por dos caminos: Ecomfive avisa el pago y el proveedor lo confirma (origen «aviso»), o la
-- importación de las hojas de pagos de Chin (origen «hoja», scripts/importar-pagos-proveedor.ts, se puede repetir).
-- RLS sin políticas (solo el servidor).

-- Las filas de las hojas de pagos de Chin: con `pedido_id` si se emparejaron con una compra; sin él quedan como historial suelto,
-- que cuenta igual para el cumplimiento.
create table if not exists proveedor_historial (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  pedido_id uuid references proveedor_pedidos(id) on delete set null,
  clave text not null,
  hoja text not null,
  pais_codigo text,
  producto text not null,
  unidades numeric,
  monto_total numeric(12,2) not null,
  anticipo_monto numeric(12,2) not null,
  fecha_envio date not null,
  fecha_llegada date,
  creado_en timestamptz not null default now(),
  unique (proveedor_id, clave)
);
create index if not exists proveedor_historial_pedido on proveedor_historial (pedido_id);
alter table proveedor_historial enable row level security;

create table if not exists proveedor_pagos (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  pedido_id uuid references proveedor_pedidos(id) on delete cascade,
  historial_id uuid references proveedor_historial(id) on delete cascade,
  cuota text not null check (cuota in ('anticipo', 'saldo')),
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null,
  origen text not null check (origen in ('aviso', 'hoja')),
  aviso_id uuid references proveedor_avisos_pago(id) on delete cascade,
  creado_en timestamptz not null default now(),
  check (pedido_id is not null or historial_id is not null)
);
create index if not exists proveedor_pagos_pedido on proveedor_pagos (pedido_id);
create index if not exists proveedor_pagos_historial on proveedor_pagos (historial_id);
alter table proveedor_pagos enable row level security;

-- Cuando el anticipo no es el 50 % (los envíos por UPS se pagan completos por adelantado), la hoja lo dice y se guarda aquí.
alter table proveedor_pedidos add column if not exists anticipo_monto numeric(12,2);

-- El comprobante del aviso de pago se ve con enlace firmado; la nota del proveedor al confirmar.
alter table proveedor_avisos_pago add column if not exists nota text;
