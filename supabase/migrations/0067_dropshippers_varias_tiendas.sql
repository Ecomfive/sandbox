-- Un dropshipper puede tener varias tiendas. `tiendas` es la lista; `tienda` (la columna de antes) queda como la primera
-- para lo que todavía lee una sola.
--
-- Las tiendas ya cargadas salen de ClickUp: la tarea guarda la tienda en dos campos («Tienda» de texto y «Tienda» de
-- lista), y una persona repetida en varias tareas puede traer una tienda distinta en cada una. Se juntan todas, sin
-- repetir y en el orden en que aparecen (primero el campo de texto). Si no había ninguna en ClickUp, se usa `tienda`.

alter table dropshippers add column if not exists tiendas text[] not null default '{}';

update dropshippers d
set tiendas = sub.t
from (
  select d2.id,
    array(
      select q.v
      from (
        select x.v, min(x.pos) as pos
        from (
          select btrim(t.tarea -> 'campos' ->> 'Tienda (short_text)') as v, t.pos
          from jsonb_array_elements(d2.clickup) with ordinality as t(tarea, pos)
          union all
          select btrim(t.tarea -> 'campos' ->> 'Tienda (drop_down)') as v, t.pos + 1000
          from jsonb_array_elements(d2.clickup) with ordinality as t(tarea, pos)
        ) x
        where x.v is not null and x.v <> ''
        group by x.v
      ) q
      order by q.pos
    ) as t
  from dropshippers d2
  where d2.clickup is not null and jsonb_typeof(d2.clickup) = 'array'
) sub
where sub.id = d.id and cardinality(sub.t) > 0 and cardinality(d.tiendas) = 0;

update dropshippers set tiendas = array[btrim(tienda)] where cardinality(tiendas) = 0 and btrim(coalesce(tienda, '')) <> '';

update dropshippers set tienda = tiendas[1] where cardinality(tiendas) > 0 and tienda is distinct from tiendas[1];
