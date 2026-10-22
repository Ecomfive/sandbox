-- Portal del proveedor, fase 3 (plan en PORTAL-PROVEEDOR.md): el portal de Chin.
--
-- La foto real que sube el proveedor al cotizar queda como adjunto de la compra (decidido el 21 oct 2026: aparte de la foto de
-- referencia), con su propio origen para distinguirla en la Actividad.
alter table wms_compra_adjuntos drop constraint if exists wms_compra_adjuntos_origen_check;
alter table wms_compra_adjuntos add constraint wms_compra_adjuntos_origen_check
  check (origen in ('adjunto', 'campo_foto', 'campo_documentos', 'sistema', 'proveedor'));

-- Cuándo entró por última vez cada cuenta del portal (lo ve Ecomfive en «Cuenta de Chin»).
alter table proveedor_usuarios add column if not exists ultimo_ingreso_en timestamptz;
alter table proveedor_usuarios add column if not exists email text;
