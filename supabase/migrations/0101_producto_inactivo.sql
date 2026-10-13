-- Producto: tercer estado «Inactivo» (pedido de Alcides, 12 oct 2026), para un producto que ya no se vende bien. Sigue
-- visible en todas partes con su insignia y vende el stock que le queda (los movimientos de inventario solo se rechazan a
-- un producto en Test, ver `wms_aplicar_cambios` en 0070); lo único que cambia es que no se puede volver a comprar
-- hasta pasarlo otra vez a Activo. Se puede repetir sin romper nada.

do $$
declare
  r record;
begin
  -- El `check` de `clase` nació sin nombre propio (0070): se busca por su definición para no depender del nombre.
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'skus_maestros'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%clase%'
  loop
    execute format('alter table skus_maestros drop constraint %I', r.conname);
  end loop;
end $$;

alter table skus_maestros
  add constraint skus_maestros_clase_check check (clase in ('fisico', 'test', 'inactivo'));
