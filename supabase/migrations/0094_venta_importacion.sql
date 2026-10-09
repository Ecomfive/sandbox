-- Compras: «Importadora» deja de ser como un país (pedido de Hernán, 8 oct 2026). Ahora una compra de venta de importación es
-- una compra de un país con la casilla «Venta de importación» marcada, y se filtra por esa columna.
--   · wms_compras.venta_importacion: la casilla.
--   · Las 12 compras que eran de Importadora pasan a México y quedan marcadas como venta de importación (conservan su código y
--     sus países de destino). Cada una deja el cambio en su Actividad.
-- Se puede repetir sin efecto.

alter table wms_compras add column if not exists venta_importacion boolean not null default false;

insert into wms_compra_eventos (compra_id, campo, valor_antes, valor_despues, autor, origen)
select id, 'pais', 'Importadora', 'México · venta de importación', 'Cambio de Importadora a país', 'sistema'
from wms_compras
where tipo = 'importacion'
on conflict do nothing;

update wms_compras
set tipo = 'pais',
    pais_id = (select id from paises where codigo = 'MX'),
    venta_importacion = true,
    actualizado_en = now()
where tipo = 'importacion';
