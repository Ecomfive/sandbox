-- 0968 · Etiquetas y franja horaria de entrega de cada orden de tienda (mejora 54).
--
-- `ven_ordenes.etiquetas_equipo` (text[]): marcas libres del equipo («regalo», «frágil», «VIP»…), para filtrar y verlas en la hoja
-- de ruta. Es otra columna que `etiquetas` (texto con las etiquetas que trae Shopify), que no se toca.
-- `ven_ordenes.franja` : cuándo prefiere recibir el cliente (mañana 8–12, tarde 12–17, noche 17–20); vacío = cualquier hora.
-- Se puede correr dos veces.

alter table ven_ordenes add column if not exists etiquetas_equipo text[] not null default '{}';
alter table ven_ordenes add column if not exists franja text;
alter table ven_ordenes drop constraint if exists ven_ordenes_franja_check;
alter table ven_ordenes add constraint ven_ordenes_franja_check check (franja is null or franja in ('manana', 'tarde', 'noche'));
create index if not exists ven_ordenes_etiquetas_equipo_idx on ven_ordenes using gin (etiquetas_equipo);
comment on column ven_ordenes.etiquetas_equipo is 'Portal AF4 360°: etiquetas libres de la orden (mejora 54).';
comment on column ven_ordenes.franja is 'Portal AF4 360°: franja horaria de entrega (manana, tarde, noche); null = cualquier hora.';
