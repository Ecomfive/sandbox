-- Asesores de tienda y Tablero de tiendas (20 nov 2026, pedido de Hernán: la encargada de atención, Beatriz, ve el rendimiento de los asesores;
-- el tablero de «Todas las tiendas» pasa a Desempeño para Admin y CEO).
-- 1) Quién cambió las etiquetas de un pedido desde el sistema (y «Confirmar pedido»), para saber qué asesor confirmó, canceló o gestionó cada pedido:
--    `ven_orden_eventos` guarda además el perfil (`usuario_id`) y las etiquetas que agregó y quitó (antes solo el nombre y un texto).
-- 2) Los módulos «tienda-asesores» (Asesores, en Pedidos de tienda) y «tienda-tablero» (Tablero de tiendas, en Desempeño), para Admin y CEO.
--    A la encargada de atención se le da «tienda-asesores» como permiso propio en Usuarios.
-- Se puede correr más de una vez. Reversa: supabase/rollbacks/0344_rollback.sql

alter table ven_orden_eventos add column if not exists usuario_id uuid references perfiles(id) on delete set null;
alter table ven_orden_eventos add column if not exists agregadas text[];
alter table ven_orden_eventos add column if not exists quitadas text[];
create index if not exists ven_orden_eventos_etiquetas_fecha on ven_orden_eventos (creado_en desc) where tipo = 'etiqueta';

insert into permisos_rol (rol_id, modulo, solo_lectura)
select r.id, m.modulo, false
from roles r
cross join (values ('tienda-asesores'), ('tienda-tablero')) as m(modulo)
where r.nombre in ('Admin', 'CEO')
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';

-- Revisión: las tres deben decir «sí».
select
  case when (select count(*) from information_schema.columns where table_name = 'ven_orden_eventos' and column_name in ('usuario_id', 'agregadas', 'quitadas')) = 3 then 'sí' else 'NO' end as columnas,
  case when exists (select 1 from pg_indexes where indexname = 'ven_orden_eventos_etiquetas_fecha') then 'sí' else 'NO' end as indice,
  case when (select count(*) from permisos_rol pr join roles r on r.id = pr.rol_id where r.nombre in ('Admin', 'CEO') and pr.modulo in ('tienda-asesores', 'tienda-tablero')) = 4 then 'sí' else 'NO' end as permisos;
