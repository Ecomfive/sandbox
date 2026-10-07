-- Compras: un comentario puede llevar imágenes y PDF (la captura de un pago, un comprobante…), como los comentarios de
-- ClickUp (pedido de Hernán, 9 oct 2026). El archivo queda ligado al comentario: se ve debajo de su texto, no aparte en
-- «Adjuntos». Es una columna nueva en `wms_compra_adjuntos`; si el comentario se borra, sus archivos también.
--
-- Orden de aplicación: este SQL antes o después del despliegue da igual para lo que ya existe (la lista de la actividad
-- sigue cargando sin la columna), pero hasta que se corra no se pueden adjuntar archivos a un comentario.

alter table wms_compra_adjuntos add column if not exists comentario_id uuid references wms_compra_comentarios(id) on delete cascade;

create index if not exists wms_compra_adjuntos_comentario_idx on wms_compra_adjuntos (comentario_id) where comentario_id is not null;
