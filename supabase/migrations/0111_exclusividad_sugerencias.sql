-- Exclusividad del cliente que recomendó un producto (pedido de Alcides, 16 oct 2026): siempre se le da al cliente que lo
-- recomendó; dura 30 días por defecto (se puede cambiar a 60 o 90) y corre desde que el producto queda disponible para vender
-- (su compra pasa a Completado). El inicio y el fin no se guardan: se calculan de la fecha en que la compra llegó a Completado.
-- Se puede repetir.
alter table sugerencias_clientes add column if not exists exclusividad_dias smallint not null default 30;
alter table sugerencias_clientes drop constraint if exists sugerencias_clientes_exclusividad_dias_check;
alter table sugerencias_clientes add constraint sugerencias_clientes_exclusividad_dias_check check (exclusividad_dias in (30, 60, 90));
