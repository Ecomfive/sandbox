-- Reversa de 0992 (Costos de producto: hoja única de Panamá). Vuelve la vista de costos de las líneas a la regla de 0317 (la columna `costo_hoja` queda, vacía: una vista no puede perder columnas) y
-- quita la hoja: las filas de la carga inicial sin compra se borran; las demás quedan como lotes comunes.

create or replace view ven_lineas_costo
with (security_invoker = true) as
select
  l.orden_id,
  o.periodo,
  o.unidad_id,
  o.estado_entrega,
  l.linea,
  l.producto,
  l.producto_clave,
  l.cantidad,
  l.es_servicio,
  l.costo_excel,
  coalesce(cm.producto_clave, cd.producto_clave) as costo_clave,
  coalesce(cm.costo_vigente, cd.costo_vigente) as costo_unitario,
  case
    when l.es_servicio then 0
    when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then round(l.cantidad * coalesce(cm.costo_vigente, cd.costo_vigente), 2)
    else l.costo_excel
  end as costo,
  case
    when l.es_servicio then 'servicio'
    when coalesce(cm.costo_vigente, cd.costo_vigente) is not null then 'costo_vigente'
    when l.costo_excel is not null then 'excel'
    else 'sin_costo'
  end as costo_fuente,
  null::numeric(14, 6) as costo_hoja
from ven_orden_lineas l
join ven_ordenes o on o.id = l.orden_id
left join ven_productos_mapeo m on m.producto_clave = l.producto_clave
left join fin_costo_vigente cm on cm.producto_clave = m.costo_clave
left join fin_costo_vigente cd on cd.producto_clave = l.producto_clave;

drop function if exists fin_producto_de_linea(uuid, text);
drop function if exists fin_costo_hoja_en(uuid, date, integer);
drop trigger if exists fin_costos_hoja_calcular on fin_costos_lotes;
drop function if exists fin_costos_hoja_calcular();
delete from fin_costos_lotes where origen = 'carga_inicial';
delete from fin_config where clave = 'costos_sin_compra';
drop index if exists fin_costos_lotes_hoja_sku;
drop index if exists fin_costos_lotes_compra;
alter table fin_costos_lotes drop constraint if exists fin_costos_lotes_asoc_positivos;
alter table fin_costos_lotes
  drop column if exists en_hoja_costos,
  drop column if exists compra_id,
  drop column if exists asoc_comision_banco_1,
  drop column if exists asoc_comision_banco_2,
  drop column if exists asoc_comision_cambio,
  drop column if exists asoc_impuesto,
  drop column if exists asoc_envio,
  drop column if exists asoc_otros,
  drop column if exists asoc_nota,
  drop column if exists costo_final_manual,
  drop column if exists costos_por,
  drop column if exists costos_por_nombre,
  drop column if exists costos_en;
