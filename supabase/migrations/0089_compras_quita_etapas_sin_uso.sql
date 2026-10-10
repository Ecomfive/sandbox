-- Compras: se quitan de la lista de etapas las que el equipo no usa (10 oct 2026): «Solicitud Internacional»,
-- «Evaluación de Proveedor», «Solicitud a Proveedor», «Compra y Pago» y «Aviso Logística». Esta migración pasa a la
-- etapa que sí se usa las compras que todavía estuvieran en una de ellas y deja el cambio en su Actividad:
--
--   solicitud_internacional  → cotizar          (solo se usa Cotizar)
--   evaluacion_proveedor     → cotizado         (se hace dentro de Cotizado)
--   solicitud_proveedor      → cotizado         (se hace dentro de Cotizado)
--   compra_pago              → tracking         (la compra y el pago se hacen durante el tracking)
--   aviso_logistica          → arribo_mercancia (solo se usa Arribo Mercancía)
--   solicitud_local          → cotizar          (ya se había quitado; por si quedara alguna)
--
-- Para ver cuántas compras mueve, antes de correrla:
--   select etapa, count(*) from wms_compras
--   where etapa in ('solicitud_internacional','evaluacion_proveedor','solicitud_proveedor','compra_pago','aviso_logistica','solicitud_local')
--   group by etapa;
--
-- La restricción de la columna `etapa` no se toca: sigue aceptando los valores de antes, que es lo que permite leer el
-- historial y los tiempos de las compras viejas (la Actividad los muestra como «… (ya no se usa)»).

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
select id, 'etapa', antes, despues, 'Migración 0089', 'sistema'
  from movidas;
