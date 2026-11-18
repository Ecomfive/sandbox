-- Reversa de 0323_pedidos_abiertos.sql: quita las funciones con filtros. Después correr de nuevo supabase/migrations/0321_indice_pedidos_tienda_fecha.sql
-- (vuelve a crear las de 3 datos). Mientras tanto Gestión de tienda sigue andando por la forma anterior, más lenta.
drop function if exists ven_lineas_periodo(uuid[], date, date, boolean, text[]);
drop function if exists ven_pedidos_periodo(uuid[], date, date, boolean, text[]);
notify pgrst, 'reload schema';
