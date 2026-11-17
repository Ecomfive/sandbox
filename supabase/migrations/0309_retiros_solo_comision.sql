-- Retiros: retiro fallido en el que solo se cobró la comisión (17 nov 2026, pedido de Hernán: «la empresa generó un envío de dinero para retirar, luego
-- fue cancelado, pero sí nos cobraron una comisión de $73»). Se registra como un retiro cuyo monto es todo comisión (A recibir 0) y queda marcado, para
-- que en la lista y la ficha no se confunda con un retiro normal. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0309_rollback.sql

alter table retiros add column if not exists solo_comision boolean not null default false;
comment on column retiros.solo_comision is 'Retiro fallido: el envío se canceló pero la plataforma cobró la comisión; el monto es todo comisión y no se recibe nada.';

notify pgrst, 'reload schema';
