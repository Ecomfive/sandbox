-- «Chin» → «Shen Zhen» en los datos, versión que no se detiene ante un error y dice qué hizo (23 oct 2026, sigue a la 0143: en la
-- lista y la ficha de Compras todavía salía «Chin»). Cada tabla va por separado: si una falla, las demás se aplican y la falla
-- aparece en la tabla de resultados del final. Cubre lo de la 0143 y, además, los textos libres (descripción y nota de una compra,
-- notas y comentarios del portal, subtareas, historial de las hojas). Se puede correr de nuevo sin efecto. Primero `proveedores`.
-- Reversa: la de la 0143 (supabase/rollbacks/0143_rollback.sql).

create temp table if not exists _shen_zhen (orden serial, tabla text, columna text, filas int, error text);
truncate _shen_zhen;

do $$
declare
  s record;
  n int;
begin
  for s in
    select * from (values
      ('proveedores', 'nombre', 'exacto'),
      ('proveedores', 'nombre_en_compras', 'exacto'),
      ('wms_compras', 'proveedor', 'exacto'),
      ('wms_compras', 'agente_envio', 'exacto'),
      ('wms_rutas_envio', 'agente', 'exacto'),
      ('wms_compra_eventos', 'valor_antes', 'exacto'),
      ('wms_compra_eventos', 'valor_despues', 'exacto'),
      ('proveedor_usuarios', 'nombre', 'texto'),
      ('wms_compra_comentarios', 'texto', 'texto'),
      ('wms_compras', 'descripcion', 'texto'),
      ('wms_compras', 'nota_proveedor', 'texto'),
      ('wms_compra_subtareas', 'nombre', 'texto'),
      ('proveedor_novedades', 'texto', 'texto'),
      ('proveedor_novedades', 'detalle', 'texto'),
      ('proveedor_pedidos', 'nota_para_proveedor', 'texto'),
      ('proveedor_pedidos', 'comentario_proveedor', 'texto'),
      ('proveedor_avisos_pago', 'nota', 'texto'),
      ('proveedor_historial', 'producto', 'texto'),
      ('proveedor_registro', 'producto', 'texto')
    ) as t(tabla, columna, modo)
  loop
    begin
      if s.modo = 'exacto' then
        execute format('update %I set %I = %L where lower(btrim(%I)) = %L and %I is distinct from %L', s.tabla, s.columna, 'Shen Zhen', s.columna, 'chin', s.columna, 'Shen Zhen');
      else
        execute format('update %I set %I = regexp_replace(%I, %L, %L, %L) where %I ~ %L', s.tabla, s.columna, s.columna, '\mChin\M', 'Shen Zhen', 'g', s.columna, '\mChin\M');
      end if;
      get diagnostics n = row_count;
      insert into _shen_zhen (tabla, columna, filas) values (s.tabla, s.columna, n);
    exception when others then
      insert into _shen_zhen (tabla, columna, error) values (s.tabla, s.columna, sqlerrm);
    end;
  end loop;
end $$;

-- Lo que cambió en cada tabla y, si algo falló, por qué. Después, lo que todavía dice «Chin» como proveedor.
select tabla, columna, filas, error from _shen_zhen order by orden;
select 'wms_compras.proveedor' as donde, proveedor as valor, count(*) as filas from wms_compras where proveedor ilike '%chin%' group by proveedor
union all
select 'proveedores.nombre_en_compras', nombre_en_compras, 1 from proveedores;
