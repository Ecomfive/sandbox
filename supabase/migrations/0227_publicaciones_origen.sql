-- Gestión de IDs Dropi: de dónde nació cada publicación (5 nov 2026, pedido de Hernán). Desde el 24 oct 2026 los productos se crean en el
-- sistema; lo que alguien hace directo en Dropi hay que verlo y resolverlo.
--   sistema        creada desde el sistema: «Publicar en Dropi», borrador, republicación o privatización.
--   dropi          el producto nació en Dropi y después se pasó al sistema («Crear publicación», «Ya está en Dropi» o se le puso su ID).
--   carga_inicial  lo que ya existía: la lista de ClickUp de Panamá y la primera carga de Costa Rica y México.
alter table dropi_publicaciones
  add column if not exists origen text not null default 'sistema'
  check (origen in ('sistema', 'dropi', 'carga_inicial'));

-- Lo que ya hay se clasifica con la actividad de cada publicación.
update dropi_publicaciones set origen = 'carga_inicial';

update dropi_publicaciones p set origen = 'sistema'
where exists (
  select 1 from historial_auditoria a
  where a.entidad = 'dropi_publicaciones' and a.entidad_id::text = p.id::text
    and (a.accion = 'crear_borrador_dropi' or (a.accion = 'crear_publicacion_dropi' and a.detalle ~ '(republicada|privatizada)'))
);

update dropi_publicaciones p set origen = 'dropi'
where exists (
  select 1 from historial_auditoria a
  where a.entidad = 'dropi_publicaciones' and a.entidad_id::text = p.id::text
    and (
      a.detalle like '%estaba en Dropi sin publicación%'
      or (
        a.accion = 'crear_publicacion_dropi' and a.creado_en >= '2026-10-24'
        and coalesce(a.usuario_nombre, '') <> 'Sistema' and coalesce(a.detalle, '') !~ '(republicada|privatizada)'
      )
    )
);

-- Cuántas cosas creadas en Dropi faltan por resolver en un país: los productos activos de la última lectura sin publicación (sin envíos ni
-- seguros) y las publicaciones nacidas en Dropi a las que les falta el producto vinculado o el costo. Para el pendiente de «Hoy» y el menú.
create or replace function dropi_creadas_por_resolver(p_pais uuid)
returns integer
language sql stable
set search_path = public
as $$
  select (
    select count(*) from dropi_productos_proveedor l
    where l.pais_id = p_pais and not l.archivado
      and translate(lower(l.nombre), 'áéíóú', 'aeiou') !~ '\y(envio|envios|seguro|seguros)\y'
      and not exists (
        select 1 from dropi_publicaciones p
        where p.pais_id = l.pais_id and l.dropi_producto_id::text = any (regexp_split_to_array(coalesce(p.dropi_id, ''), '[^0-9]+'))
      )
  )::integer + (
    select count(*) from dropi_publicaciones p
    where p.pais_id = p_pais and p.origen = 'dropi' and p.estado <> 'archivado' and p.estado_publicacion is distinct from 'archivado'
      and p.duplicada_de is null and (p.sku_maestro_id is null or coalesce(p.costo_mercancia, 0) <= 0)
  )::integer;
$$;

revoke all on function dropi_creadas_por_resolver(uuid) from public, anon, authenticated;
