-- Reversa de 0163_rendimiento_tanda2.sql: el sistema vuelve solo a leer las tablas completas.
drop function if exists dropi_ventas_diarias_compactas(uuid, date, integer[]);
drop function if exists dropi_ventas_dinero_por_mes(uuid);
drop function if exists ordenes_por_dia(uuid, date, date);
drop function if exists movimientos_por_dia(uuid, date, date);
drop index if exists ordenes_pais_fecha_idx;
