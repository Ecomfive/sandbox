-- Gestión de publicaciones Dropi: un número correlativo propio para cada publicación (PUB-0001, 21 oct 2026).
-- Es distinto al ID de Dropi (ese lo pone Dropi, a veces son dos «7231-7679» y puede faltar): este lo pone el sistema al crear la
-- publicación, nunca cambia ni se repite, y es el mismo en todos los países. Las publicaciones que ya existen se numeran por fecha
-- de creación (y por nombre entre las creadas a la vez), como se hizo con Producto (migración 0089). Se puede correr más de una vez.

create sequence if not exists dropi_publicaciones_numero_seq;
alter table dropi_publicaciones add column if not exists numero bigint;

with orden as (
  select id, row_number() over (order by creado_en, nombre, id) + coalesce((select max(numero) from dropi_publicaciones), 0) as n
  from dropi_publicaciones
  where numero is null
)
update dropi_publicaciones p set numero = orden.n from orden where p.id = orden.id;

select setval('dropi_publicaciones_numero_seq', greatest(coalesce((select max(numero) from dropi_publicaciones), 0), 1));
alter table dropi_publicaciones alter column numero set default nextval('dropi_publicaciones_numero_seq');
alter table dropi_publicaciones alter column numero set not null;
create unique index if not exists dropi_publicaciones_numero_unico on dropi_publicaciones (numero);
