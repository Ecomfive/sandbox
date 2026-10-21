-- Gestión de publicaciones Dropi › vincular los SKU (21 oct 2026): la huella de la foto de cada publicación (dHash, como
-- `skus_maestros.foto_huella`), para sugerir el producto de Producto que tiene la misma foto. La calcula
-- scripts/vincular-skus-publicaciones.ts (y la importación, al copiar una foto nueva). Se puede repetir.

alter table dropi_publicaciones add column if not exists foto_huella text;
