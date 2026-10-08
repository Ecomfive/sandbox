-- Países que puede ver cada persona (pedido de Hernán, 8 oct 2026): quien es de un país solo ve las compras de ese país.
-- `null` = todos los países (lo de siempre, y lo que tiene quien no se limita). Una lista = solo esos códigos de país
-- («PA», «CR»…); «importacion» deja ver también las compras de Compras Importadora (no tienen país). Lo aplica el servidor
-- (src/lib/paises-permitidos.ts) en Compras, en el histórico de compras de Producto e Inventario y en el país de la barra.
-- Se puede correr más de una vez.

alter table perfiles add column if not exists paises_permitidos text[];
