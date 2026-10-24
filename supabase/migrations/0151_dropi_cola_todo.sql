-- Gestión de IDs Dropi › todo lo que cambia algo en Dropi pasa por la cola de «Aplicar en Dropi» (pedido de Jhokser, 24 oct 2026).
-- Antes solo el nombre, el precio, apagar y republicar quedaban pendientes. Ahora también:
--  · «archivar» (y «sacar de Archivados»): archiva (o desarchiva) el producto en Dropi con su `archiveProduct` / `unarchive`.
--  · la descripción del producto (`descripcion`) y las fotos que la IA generó y alguien aprobó (`fotos`): dentro de un cambio normal.
--  · «crear»: una publicación nueva que se publica en Dropi desde el sistema. Mientras no se aplique, la publicación está «Sin
--    publicar» (`estado_publicacion = 'borrador'`) y guarda en `datos_dropi` todo lo que Dropi exige; si se deshace, queda como borrador.
-- Código: src/lib/publicaciones/cambios-dropi.ts, crear-dropi.ts, marcador-aplicar-dropi.ts, aplicar-actions.ts, pendientes-actions.ts.
-- Reversa: supabase/rollbacks/0151_rollback.sql

-- Dos tipos más de cambio (se busca la restricción por lo que dice, no por su nombre).
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'dropi_cambios_pendientes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo = ANY%' loop
    execute format('alter table dropi_cambios_pendientes drop constraint %I', c);
  end loop;
end $$;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar', 'archivar', 'crear'));

-- Una publicación que todavía no existe en Dropi no tiene ID de producto: se llena al crearla (junto con `nuevo_dropi_id`).
alter table dropi_cambios_pendientes alter column dropi_producto_id drop not null;

alter table dropi_cambios_pendientes
  -- «archivar»: true = sacarlo de Archivados en Dropi (`unarchive`); false = archivarlo.
  add column if not exists restaurar boolean not null default false,
  -- «archivar»: cómo estaba la publicación en el sistema, para devolverla a eso si se deshace el cambio pendiente.
  add column if not exists estado_antes text,
  add column if not exists estado_publicacion_antes text,
  -- «cambio»: la descripción nueva (HTML ya limpio) y la que tenía el sistema antes (para deshacer).
  add column if not exists descripcion text,
  add column if not exists descripcion_antes text,
  -- «cambio»: las fotos que se suman al producto en Dropi: [{ "url": "...", "nombre": "..." }].
  add column if not exists fotos jsonb,
  -- «crear»: todo lo que Dropi pide para publicar el producto (ver src/lib/publicaciones/crear-dropi.ts › DatosCrearDropi).
  add column if not exists datos jsonb;

-- Un cambio lleva algo: un nombre, un precio, una descripción o fotos; los demás tipos son la acción misma.
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar', 'archivar', 'crear') or nombre is not null or precio is not null or precio_sugerido is not null or descripcion is not null or fotos is not null);

-- Un solo archivar y un solo crear esperando por publicación.
create unique index if not exists dropi_cambios_pendientes_archivar_idx
  on dropi_cambios_pendientes (publicacion_id) where tipo = 'archivar' and estado in ('pendiente', 'error');
create unique index if not exists dropi_cambios_pendientes_crear_idx
  on dropi_cambios_pendientes (publicacion_id) where tipo = 'crear' and estado in ('pendiente', 'error');

-- La publicación: el estado «Sin publicar» (borrador), lo que Dropi pide para publicarla y la descripción que conoce el sistema.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'dropi_publicaciones'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%estado_publicacion = ANY%' loop
    execute format('alter table dropi_publicaciones drop constraint %I', c);
  end loop;
end $$;
alter table dropi_publicaciones add constraint dropi_publicaciones_estado_publicacion_check
  check (estado_publicacion in ('activo', 'archivado', 'eliminado', 'descartado', 'en_espera', 'borrador'));
alter table dropi_publicaciones add column if not exists datos_dropi jsonb;
alter table dropi_publicaciones add column if not exists descripcion text;
