-- Gestión de tienda › fecha de despacho y forma de pago (14 nov 2026, pedido de Hernán al comparar el sistema con el Excel Matriz de administración:
-- «empieza por la fecha de despacho y la forma de pago»).
--   * `ven_ordenes.forma_pago_entrega`: cómo pagó el cliente al recibir (efectivo, Yappy, transferencia, tarjeta), la «FORMA DE PAGO» de la Matriz. La
--     anota el repartidor en Monday («Forma de Pago»); `metodo_pago` sigue siendo el de Shopify (contra entrega), del que sale lo que se espera cobrar.
--   * `mon_despachos.forma_pago` y `monto_cobrado`: las columnas «Forma de Pago» y «$ Cobrado» de los tableros de Monday.
--   * La fecha de despacho (`despachada_en`, `fecha_envio`) sale de Shopify (cuándo se preparó) o, si no la trae, del día del reparto en Monday o de la
--     emisión de la guía de Servientrega (código, sin columnas nuevas).
--   * Para llenar lo de antes: Monday vuelve a leer sus tableros enteros (una o dos veces «Leer ahora») y Shopify relee Kenku y Oferfy desde el 13 oct.
-- Se puede correr de nuevo. Reversa: supabase/rollbacks/0295_rollback.sql
alter table ven_ordenes add column if not exists forma_pago_entrega text;
alter table ven_ordenes drop constraint if exists ven_ordenes_forma_pago_entrega_check;
alter table ven_ordenes add constraint ven_ordenes_forma_pago_entrega_check
  check (forma_pago_entrega is null or forma_pago_entrega in ('efectivo', 'yappy', 'transferencia', 'tarjeta', 'otro'));

alter table mon_despachos add column if not exists forma_pago text check (forma_pago is null or length(forma_pago) <= 60);
alter table mon_despachos add column if not exists monto_cobrado numeric(12, 2) check (monto_cobrado is null or monto_cobrado >= 0);

-- Releer Monday entero (para traer la forma de pago de lo que ya estaba leído).
update mon_config set cursor_actualizado = null where id = 1;
update mon_tableros_extra set cursor_actualizado = null where clase = 'despachos';

-- Releer Shopify de Kenku y Oferfy desde el 13 oct (para traer la fecha en que se preparó cada pedido; lo que no cambió no se reescribe).
update fin_shopify_estado set cursor = '2026-10-13T00:00:00Z' where tienda in ('KENKU', 'OFERFY') and cursor > '2026-10-13T00:00:00Z';

notify pgrst, 'reload schema';
