-- CRM Dropshippers › ficha: las ventas en Dropi de cada dropshipper por producto y por mes (pedido de Hernán, 21 oct 2026), para
-- mostrar en su ficha qué vende y cómo le va mes a mes. Sale del mismo Historial de Existencia de Desempeño › Ventas Dropi
-- (migración 0120): lo carga scripts/importar-ventas-dropi.ts y cada carga reemplaza la anterior del país. Se puede repetir.
--
-- El dropshipper es quien creó la orden en Dropi (su usuario, `dropi_usuario_id`); se une a su ficha por su cuenta de Dropi
-- vinculada (`dropshipper_cuentas.id_externo`, migración 0065).

create table if not exists dropi_ventas_dropshipper_mes (
  pais_id uuid not null references paises(id),
  dropi_usuario_id integer not null,
  dropi_producto_id integer not null,
  -- El primer día del mes (hora de Panamá).
  mes date not null,
  pedidas integer not null default 0,
  ordenes integer not null default 0,
  -- Canceladas, rechazadas o devueltas de sus órdenes (por el número de orden).
  no_efectivas integer not null default 0,
  primary key (pais_id, dropi_usuario_id, dropi_producto_id, mes)
);
create index if not exists dropi_ventas_dropshipper_mes_usuario_idx on dropi_ventas_dropshipper_mes (pais_id, dropi_usuario_id);

-- Solo el servidor (clave de servicio) toca los datos: RLS sin políticas.
alter table dropi_ventas_dropshipper_mes enable row level security;
