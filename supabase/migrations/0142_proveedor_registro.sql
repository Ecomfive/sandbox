-- Portal del proveedor › «Registro de pagos» editable (23 oct 2026, decisión de Hernán): Chin (en su portal) y Ecomfive (en el Tablero
-- de Chin) cambian cualquier celda de la tabla con las columnas de la hoja «payment record». Lo editado vive aquí, aparte de la compra:
-- Compras lo actualiza Francis a mano. Cada fila es un envío: `fila` = el id del pedido del espejo o `hoja:<clave>` para una fila de
-- las hojas de Chin sin compra (la clave sobrevive a cada importación). Una columna en null = el valor de siempre (de la compra, de la
-- hoja o calculado). Pagado, fecha de pago, pago del saldo, monto, envío y anticipo cuentan para las cuotas (vencimientos, «Qué hacer
-- con Chin»); sin pagar, vence y saldo escritos a mano solo cambian lo que muestra la tabla. RLS sin políticas (solo el servidor).

create table if not exists proveedor_registro (
  id uuid primary key default uuid_v7(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  fila text not null,
  producto text,
  unidades numeric,
  monto numeric(12,2),
  fecha_envio date,
  anticipo numeric(12,2),
  pagado numeric(12,2),
  fecha_pago date,
  sin_pagar numeric(12,2),
  vence date,
  saldo numeric(12,2),
  llegada date,
  fecha_pago_saldo date,
  actualizado_por_nombre text,
  actualizado_en timestamptz not null default now(),
  unique (proveedor_id, fila)
);
alter table proveedor_registro enable row level security;
