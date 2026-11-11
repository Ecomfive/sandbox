-- Gestión de IDs Drop: costo escrito a mano (10 nov 2026, pedido de Hernán: «2 IDs en Drop CR no tienen costo de mercancía y no me aparece la opción»). El costo de
-- una publicación de Drop sale de Gestión de IDs Dropi del país (su producto o, si es una variante sin costo, otra variante del mismo producto); solo cuando no
-- hay ninguno se usa este, que escribe una persona en la ficha, en la moneda de Drop. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0267_rollback.sql

alter table drop_publicaciones add column if not exists costo_manual numeric check (costo_manual is null or costo_manual >= 0);

notify pgrst, 'reload schema';
