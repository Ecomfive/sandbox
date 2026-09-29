-- La etiqueta ("Etiquetas") de ClickUp en «Productos y Filtro PA»: un tache de color junto al nombre del
-- producto que dice de qué tienda salió. Por ahora solo existen dos valores en ClickUp (kenku, cliente
-- dropi); se deja como lista fija, igual que Tipo de Envío, para que la insignia use un color exacto y no
-- cualquier texto libre.

alter table wms_filtro_productos
  add column tienda text check (tienda in ('kenku', 'cliente_dropi'));
