-- Compras › Por país (5 nov 2026, pedido de Alcides): la tabla de qué productos existen en cada país y las decisiones «Enviar» o «Descartado»
-- (0231) son decisiones de compra de Alcides. Se pasan de Producto a Compras y solo las abre quien tiene el módulo `compras-por-pais`, que se
-- da por persona (no por rol: el rol Admin lo tienen otras personas). Por ahora, solo Alcides. Se puede correr de nuevo sin efecto.
-- Reversa: supabase/rollbacks/0232_rollback.sql
insert into permisos_persona (perfil_id, modulo, nivel)
select id, 'compras-por-pais', 'edicion' from perfiles
where id = 'a3e6cde5-006a-42a6-91df-db2ac88dffbb'
on conflict (perfil_id, modulo) do nothing;
