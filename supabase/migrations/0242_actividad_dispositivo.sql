-- Equipo › Rendimiento (pedido de Hernán, 6 nov 2026): la ficha de cada persona dice si se conectó desde una computadora o desde el teléfono. Cada minuto anotado guarda de qué
-- dispositivo vino, según el navegador. Lo anotado antes queda en null («sin dato»): no se puede saber. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0242_rollback.sql

alter table actividad_minutos add column if not exists dispositivo text check (dispositivo in ('computadora', 'telefono', 'tablet'));

notify pgrst, 'reload schema';
