-- Reversa de la migración 0151 (cola de «Aplicar en Dropi» para archivar, descripción, fotos y publicaciones nuevas).
-- Antes de correrla: deja sin pendientes los cambios de tipo archivar y crear, y las publicaciones en «Sin publicar» pásalas a otro estado.

update dropi_cambios_pendientes set estado = 'reemplazado' where tipo in ('archivar', 'crear') and estado in ('pendiente', 'error');
update dropi_publicaciones set estado_publicacion = 'en_espera' where estado_publicacion = 'borrador';

alter table dropi_publicaciones drop column if exists descripcion;
alter table dropi_publicaciones drop column if exists datos_dropi;
alter table dropi_publicaciones drop constraint if exists dropi_publicaciones_estado_publicacion_check;
alter table dropi_publicaciones add constraint dropi_publicaciones_estado_publicacion_check
  check (estado_publicacion in ('activo', 'archivado', 'eliminado', 'descartado', 'en_espera'));

drop index if exists dropi_cambios_pendientes_crear_idx;
drop index if exists dropi_cambios_pendientes_archivar_idx;

-- Los archivar y publicar no existían, y un cambio que solo llevaba descripción o fotos no cabe en la restricción de antes.
delete from dropi_cambios_pendientes where tipo in ('archivar', 'crear');
delete from dropi_cambios_pendientes where tipo = 'cambio' and nombre is null and precio is null and precio_sugerido is null;
alter table dropi_cambios_pendientes drop constraint if exists dropi_cambios_pendientes_algo_check;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_algo_check
  check (tipo in ('republicar', 'apagar') or nombre is not null or precio is not null or precio_sugerido is not null);

alter table dropi_cambios_pendientes drop column if exists datos;
alter table dropi_cambios_pendientes drop column if exists fotos;
alter table dropi_cambios_pendientes drop column if exists descripcion_antes;
alter table dropi_cambios_pendientes drop column if exists descripcion;
alter table dropi_cambios_pendientes drop column if exists estado_publicacion_antes;
alter table dropi_cambios_pendientes drop column if exists estado_antes;
alter table dropi_cambios_pendientes drop column if exists restaurar;
delete from dropi_cambios_pendientes where dropi_producto_id is null;
alter table dropi_cambios_pendientes alter column dropi_producto_id set not null;

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'dropi_cambios_pendientes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo = ANY%' loop
    execute format('alter table dropi_cambios_pendientes drop constraint %I', c);
  end loop;
end $$;
alter table dropi_cambios_pendientes add constraint dropi_cambios_pendientes_tipo_check check (tipo in ('cambio', 'republicar', 'apagar'));
