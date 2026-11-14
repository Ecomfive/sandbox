-- Monday › «GESTION DEVOLUCION OFERFY» (14 nov 2026, pedido de Hernán, al crear Oferfy en el sistema). Tiene las mismas columnas que el de Kenku
-- (migración 0288): se lee con los tableros de los repartidores y aplica la misma regla de despachos: DESINTEGRADO o RECHAZADO de los asesores →
-- devuelto (o cancelado si en el sistema seguía por confirmar), con la nota de los asesores como evidencia; PROCESADO, POSPUESTO, FALLIDO y
-- RECOLECTADO siguen en ruta. Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0293_rollback.sql
insert into mon_tableros_extra (tablero_id, nombre, clase) values ('18429046262', 'Devoluciones Oferfy', 'despachos')
on conflict (tablero_id) do nothing;

notify pgrst, 'reload schema';
