-- Vuelve a poner el `check` de 0135 (solo los siete tipos de foto anteriores). `not valid`: no revisa las guías que ya se guardaron con
-- «ingredientes», «como_usar» o «escala»; esas conviene eliminarlas o pasarlas a «general» antes de volver a validar.
alter table dropi_ia_estilos_imagen drop constraint if exists dropi_ia_estilos_imagen_tipo_check;
alter table dropi_ia_estilos_imagen
  add constraint dropi_ia_estilos_imagen_tipo_check
  check (tipo in ('general', 'principal', 'beneficios', 'uso', 'comparacion', 'estilo_cliente', 'contenido', 'detalle')) not valid;
