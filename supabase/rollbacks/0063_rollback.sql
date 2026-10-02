-- Reversa de la migración 0063: devuelve a cualquier usuario con sesión el acceso de lectura y escritura a las tablas.
-- Úsala solo si algo dejó de funcionar y hay que volver al estado anterior mientras se investiga.
-- ATENCIÓN: esto vuelve a abrir la base a cualquier cuenta con sesión. Antes de correrla, confirma que el registro de
-- cuentas de Supabase sigue cerrado.
-- Crea cada política solo si su tabla existe (el CRM v2 de la migración 0062 puede no estar en producción).

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('alertas_inventario_no_retornado', 'authenticated read/write'),
      ('casos_dropshipper', 'authenticated read/write'),
      ('conciliaciones', 'authenticated read/write'),
      ('cuentas_extraccion', 'authenticated read/write'),
      ('cuentas_retiro', 'authenticated read/write'),
      ('dropi_retiros_sin_vincular', 'authenticated read/write'),
      ('dropi_sesiones', 'dropi_sesiones autenticados'),
      ('dropshippers', 'authenticated read/write'),
      ('extractos_bancarios', 'authenticated read/write'),
      ('favoritos_nav', 'favoritos_nav autenticados'),
      ('gastos', 'authenticated read/write'),
      ('historial_auditoria', 'authenticated read/write'),
      ('historial_cartera', 'authenticated read/write'),
      ('interacciones_dropshipper', 'authenticated read/write'),
      ('movimientos_bancarios', 'authenticated read/write'),
      ('movimientos_inventario', 'authenticated read/write'),
      ('ordenes', 'authenticated read/write'),
      ('pais_plataformas', 'authenticated read/write'),
      ('paises', 'authenticated read/write'),
      ('patrones_bancarios', 'patrones_bancarios autenticados'),
      ('pedidos_dropshipper', 'authenticated read/write'),
      ('perfiles', 'authenticated read/write'),
      ('permisos_rol', 'authenticated read/write'),
      ('plataformas', 'authenticated read/write'),
      ('productos', 'authenticated read/write'),
      ('proveedores_competencia', 'authenticated read/write'),
      ('retiro_eventos', 'authenticated read/write'),
      ('retiros', 'authenticated read/write'),
      ('roles', 'authenticated read/write'),
      ('saldos_wallet', 'authenticated read/write'),
      ('sku_maestro_componentes', 'authenticated read/write'),
      ('skus_maestros', 'authenticated read/write'),
      ('snapshots_proveedor_competencia', 'authenticated read/write'),
      ('wms_bodegas', 'authenticated read/write'),
      ('wms_compras', 'authenticated read/write'),
      ('wms_dropi_producto_medios', 'authenticated read/write'),
      ('wms_dropi_productos', 'authenticated read/write'),
      ('wms_filtro_productos', 'authenticated read/write'),
      ('wms_producto_inventario', 'authenticated read/write'),
      ('wms_producto_medios', 'authenticated read/write'),
      ('wms_producto_variantes', 'authenticated read/write'),
      ('wms_productos', 'authenticated read/write'),
      ('wms_productos_test', 'authenticated read/write'),
      ('wms_ubicaciones', 'authenticated read/write')
    ) as v(tabla, politica)
  loop
    if to_regclass('public.' || r.tabla) is not null then
      execute format('create policy %I on public.%I for all using (auth.role() = %L)', r.politica, r.tabla, 'authenticated');
    end if;
  end loop;
end $$;

-- Políticas de escritura de avatares (la app sube la foto con la clave de servicio; estas solo servían para subir
-- directo desde el navegador).
create policy "cada quien sube su propio avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cada quien actualiza su propio avatar" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cada quien borra su propio avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Quita los límites de los buckets.
update storage.buckets set file_size_limit = null, allowed_mime_types = null
where id in ('avatars', 'wms-productos', 'extractos-bancarios', 'comprobantes-retiro');
