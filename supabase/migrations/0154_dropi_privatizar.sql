-- Gestión de IDs Dropi › «Privatizar en Dropi» (pedido de Jhokser, 26 oct 2026): dejarle un producto a un solo dropshipper, como los «P-MA …».
-- Es un cambio más de la cola de «Aplicar en Dropi» (`tipo = 'privatizar'`) que va en la publicación pública de la que salen las unidades y lleva en
-- `datos` todo lo que se necesita (correo de Dropi del dropshipper, su nombre, iniciales del «P-XX», unidades, bodega, precio y nombre del privado;
-- ver src/lib/publicaciones/privatizar-dropi.ts › DatosPrivatizar). El favorito, desde la pestaña de Dropi, comprueba el correo, crea el producto
-- privado, le pone fotos, garantías y stock, se lo asigna al dropshipper en «Productos privados» y le saca esas unidades al público. Al terminar, el
-- sistema crea la publicación privada (`nueva_publicacion_id`, migración 0145) con su ID de Dropi, `privatizado_a` y `privatizado_email`.
-- Código: src/lib/publicaciones/privatizar-dropi.ts, cambios-dropi.ts (encolarPrivatizar), marcador-aplicar-dropi.ts, aplicar-actions.ts.
-- Reversa: supabase/rollbacks/0154_rollback.sql

-- «privatizar» como un tipo más de cambio (se busca la restricción por lo que dice, no por su nombre).
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'dropi_cambios_pendientes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo = ANY%' loop
    execute format('alter table dropi_cambios_pendientes drop constraint %I', c);
  end loop;
end $$;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar', 'archivar', 'crear', 'privatizar'));

-- Una privatización no lleva nombre ni precios propios (van en `datos`).
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar', 'archivar', 'crear', 'privatizar') or nombre is not null or precio is not null or precio_sugerido is not null or descripcion is not null or fotos is not null);

-- Una publicación se puede privatizar a varios dropshippers a la vez, pero no dos veces al mismo correo mientras la primera siga esperando.
create unique index if not exists dropi_cambios_pendientes_privatizar_idx
  on dropi_cambios_pendientes (publicacion_id, lower(datos ->> 'correo')) where tipo = 'privatizar' and estado in ('pendiente', 'error');
