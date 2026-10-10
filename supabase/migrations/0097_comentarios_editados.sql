-- Compras: quien escribió un comentario lo puede editar (pedido de Hernán, 9 oct 2026). `editado_en` dice cuándo se editó por
-- última vez: el comentario se ve marcado «(editado)». Se puede correr antes o después de publicar: sin ella los comentarios se
-- ven igual, solo que no se pueden editar.

alter table wms_compra_comentarios add column if not exists editado_en timestamptz;
