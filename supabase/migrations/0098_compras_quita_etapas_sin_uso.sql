-- Compras: se quitan de la lista de etapas las que el equipo no usa (10 oct 2026): Â«Solicitud InternacionalÂ»,
-- Â«EvaluaciÃ³n de ProveedorÂ», Â«Solicitud a ProveedorÂ», Â«Compra y PagoÂ» y Â«Aviso LogÃ­sticaÂ». Esta migraciÃ³n pasa a la
-- etapa que sÃ­ se usa las compras que todavÃ­a estuvieran en una de ellas y deja el cambio en su Actividad:
--
--   solicitud_internacional  â†’ cotizar          (solo se usa Cotizar)
--   evaluacion_proveedor     â†’ cotizado         (se hace dentro de Cotizado)
--   solicitud_proveedor      â†’ cotizado         (se hace dentro de Cotizado)
--   compra_pago              â†’ tracking         (la compra y el pago se hacen durante el tracking)
--   aviso_logistica          â†’ arribo_mercancia (solo se usa Arribo MercancÃ­a)
--   solicitud_local          â†’ cotizar          (ya se habÃ­a quitado; por si quedara alguna)
--
-- Para ver cuÃ¡ntas compras mueve, antes de correrla:
--   select etapa, count(*) from wms_compras
--   where etapa in ('solicitud_internacional','evaluacion_proveedor','solicitud_proveedor','compra_pago','aviso_logistica','solicitud_local')
--   group by etapa;
--
-- La restricciÃ³n de la columna `etapa` no se toca: sigue aceptando los valores de antes, que es lo que permite leer el
-- historial y los tiempos de las compras viejas (la Actividad los muestra como Â«â€¦ (ya no se usa)Â»).

with movidas as (
  update wms_compras c
     set etapa = case o.antes
           when 'solicitud_internacional' then 'cotizar'
           when 'evaluacion_proveedor'    then 'cotizado'
           when 'solicitud_proveedor'     then 'cotizado'
           when 'compra_pago'             then 'tracking'
           when 'aviso_logistica'         then 'arribo_mercancia'
           when 'solicitud_local'         then 'cotizar'
         end,
         actualizado_en = now()
    from (
      select id, etapa as antes
        from wms_compras
       where etapa in ('solicitud_internacional', 'evaluacion_proveedor', 'solicitud_proveedor', 'compra_pago', 'aviso_logistica', 'solicitud_local')
    ) o
   where c.id = o.id
  returning c.id, o.antes, c.etapa as despues
)
insert into wms_compra_eventos (compra_id, campo, valor_antes, valor_despues, autor, origen)
select id, 'etapa', antes, despues, 'MigraciÃ³n 0089', 'sistema'
  from movidas;
