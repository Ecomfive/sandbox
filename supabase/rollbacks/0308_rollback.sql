-- Reversa de 0308: quita el estado de mensaje «manual» (los que lo tenían pasan a «enviado»).
update confirmacion_ia_analisis set mensaje_estado = 'enviado' where mensaje_estado = 'manual';
alter table confirmacion_ia_analisis drop constraint if exists confirmacion_ia_analisis_mensaje_estado_check;
alter table confirmacion_ia_analisis add constraint confirmacion_ia_analisis_mensaje_estado_check
  check (mensaje_estado in ('no_aplica', 'apagado', 'enviado', 'pendiente_plantilla', 'sin_chat', 'error'));
notify pgrst, 'reload schema';
