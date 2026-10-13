-- Producto (13 oct 2026, pedido de Hernán):
-- 1. Cuarto estado «Descontinuado» (`clase = 'descontinuado'`): un producto que ya no se va a traer más. Como Inactivo, sigue
--    visible y vende lo que le queda (solo un producto en Test rechaza movimientos), pero no se puede comprar hasta pasarlo a
--    Activo desde su ficha.
-- 2. `foto_huella`: la huella de su foto (dHash de 64 bits en hexadecimal, `src/lib/wms/huella-foto.ts`) para avisar de un
--    posible duplicado al crear un producto con una foto parecida. La llena el sistema al guardar una foto;
--    `scripts/calcular-huellas-fotos.ts` calcula las de las fotos que ya había.
-- Se puede repetir sin romper nada.

do $$
declare
  r record;
begin
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
  add constraint skus_maestros_clase_check check (clase in ('fisico', 'test', 'inactivo', 'descontinuado'));

alter table skus_maestros
  add column if not exists foto_huella text check (foto_huella is null or foto_huella ~ '^[0-9a-f]{16}$');
