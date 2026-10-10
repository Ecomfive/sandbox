-- Compras: se quitan los campos «Documentos» (enlace a la factura o soporte) y «Producto relacionado» (pedido de Hernán,
-- 8 oct 2026). Lo que tenían no se pierde: pasa a los comentarios de cada compra.
--   · Los archivos que vinieron del campo «Documentos» de ClickUp (wms_compra_adjuntos.origen = 'campo_documentos') quedan
--     dentro de un comentario «Documentos (factura o soporte)», con la fecha y la persona del primer archivo.
--   · Un texto o enlace escrito en esos campos queda como comentario «Documentos: …» / «Producto relacionado: …».
-- Se corre DESPUÉS de publicar el código que ya no lee esas columnas. Se puede repetir sin duplicar.

do $$
declare
  r record;
  nuevo uuid;
begin
  for r in
    select compra_id, min(creado_en) as creado_en, (array_agg(subido_por order by creado_en))[1] as autor
    from wms_compra_adjuntos
    where origen = 'campo_documentos' and comentario_id is null
    group by compra_id
  loop
    insert into wms_compra_comentarios (compra_id, autor, texto, creado_en)
    values (r.compra_id, r.autor, 'Documentos (factura o soporte)', r.creado_en)
    returning id into nuevo;
    update wms_compra_adjuntos set comentario_id = nuevo
    where compra_id = r.compra_id and origen = 'campo_documentos' and comentario_id is null;
  end loop;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_compras' and column_name = 'documentos') then
    execute $q$
      insert into wms_compra_comentarios (compra_id, autor, texto, creado_en)
      select id, null, 'Documentos: ' || btrim(documentos), coalesce(actualizado_en, creado_en)
      from wms_compras where nullif(btrim(documentos), '') is not null
    $q$;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_compras' and column_name = 'producto_relacionado') then
    execute $q$
      insert into wms_compra_comentarios (compra_id, autor, texto, creado_en)
      select id, null, 'Producto relacionado: ' || btrim(producto_relacionado), coalesce(actualizado_en, creado_en)
      from wms_compras where nullif(btrim(producto_relacionado), '') is not null
    $q$;
  end if;
end $$;

alter table wms_compras drop column if exists documentos;
alter table wms_compras drop column if exists producto_relacionado;
