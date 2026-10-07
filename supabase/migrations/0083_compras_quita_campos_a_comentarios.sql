-- Compras: se quitan ocho campos de ClickUp que ya no se usan como columnas (pedido de Hernán, 9 oct 2026): Cliente,
-- Track ID, Orden, Pago Pendiente, Cobrado Cliente, Pendiente Cliente, Pago Cliente y Cuenta receptora.
--
-- Antes de borrarlas, el dato de cada compra que lo tenga pasa a un comentario de esa misma compra con el título que tenía el
-- campo («Track ID: 1Z999…», «Pago Pendiente: $1,250.00»), para que se pueda seguir buscando en la Actividad. Un comentario
-- por campo con dato; los vacíos no dejan nada. «Cerrada» (la fecha de cierre) NO se toca: la pone el sistema y de ella salen
-- el ciclo y los tiempos.
--
-- Orden de aplicación: primero se despliega el código (que ya no pide estas columnas) y después se corre este SQL. Se puede
-- correr más de una vez: si una columna ya no existe, se salta. Todo ocurre en una sola transacción.

do $$
declare
  campo record;
  hay boolean;
begin
  for campo in
    select * from (values
      ('cliente',           'Cliente',           'texto'),
      ('track_id',          'Track ID',          'texto'),
      ('orden',             'Orden',             'texto'),
      ('pago_cliente',      'Pago Cliente',      'texto'),
      ('cuenta_receptora',  'Cuenta receptora',  'texto'),
      ('pago_pendiente',    'Pago Pendiente',    'dinero'),
      ('cobrado_cliente',   'Cobrado Cliente',   'dinero'),
      ('pendiente_cliente', 'Pendiente Cliente', 'dinero')
    ) as v(columna, titulo, tipo)
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'wms_compras' and column_name = campo.columna
    ) into hay;
    if not hay then
      continue;
    end if;

    if campo.tipo = 'texto' then
      execute format(
        'insert into wms_compra_comentarios (compra_id, autor, texto)
         select id, %L, %L || '': '' || btrim(%I)
         from wms_compras
         where %I is not null and btrim(%I) <> ''''',
        'Campo eliminado', campo.titulo, campo.columna, campo.columna, campo.columna
      );
    else
      -- Un monto de 0 o vacío no dice nada; cualquier otro se conserva.
      execute format(
        'insert into wms_compra_comentarios (compra_id, autor, texto)
         select id, %L, %L || '': $'' || to_char(%I, ''FM999,999,990.00'')
         from wms_compras
         where %I is not null and %I <> 0',
        'Campo eliminado', campo.titulo, campo.columna, campo.columna, campo.columna
      );
    end if;

    execute format('alter table wms_compras drop column %I', campo.columna);
  end loop;
end $$;
