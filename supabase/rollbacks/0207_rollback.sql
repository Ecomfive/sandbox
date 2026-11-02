-- Reversa de 0207_crm_pareto.sql: quita las dos consultas del Pareto de Dirección (no hay tablas ni datos que deshacer).
drop function if exists crm_productos_de_dropshipper(uuid, uuid, integer);
drop function if exists crm_pedidos_mensuales(uuid, integer);
