-- Recepción de compras en la oficina (6 nov 2026, pedido de Hernán, flujograma de Proveeduría Costa Rica): al llegar una compra se cuenta cada producto contra lo pedido, se
-- anota por qué no cuadra y entra al inventario en un solo paso. Las columnas `cantidad_recibida`, `fecha_recepcion` y `bodega_id` de `wms_compra_items` ya estaban, sin usarse.

alter table wms_movimientos drop constraint if exists wms_movimientos_origen_check;
alter table wms_movimientos add constraint wms_movimientos_origen_check
  check (origen in ('manual', 'sync_dropi', 'sync_shopify', 'pedido', 'conteo', 'transferencia', 'envio_dropi', 'compra'));

-- Drop es la bodega y Boxfull quien entrega: son lo mismo (Hernán, 6 nov 2026).
update wms_bodegas b set nombre = 'Drop (Boxfull)'
from paises p
where p.id = b.pais_id and p.codigo = 'CR' and b.codigo = 'boxfull';

-- Recibe líneas de una compra en una bodega propia del mismo país, todo o nada. `p_items` = [{ item, cantidad, nota?, ubicacion?, lote_codigo?, vencimiento? }]. Una línea se
-- recibe una sola vez; si la cantidad no es la pedida, la nota es obligatoria y queda en la línea. Lo que llegue después entra por el Levantamiento, con «Sumar».
create or replace function wms_recibir_compra(p_compra uuid, p_bodega uuid, p_items jsonb, p_usuario uuid default null) returns jsonb
language plpgsql as $$
declare
  v_compra record;
  v_bodega record;
  v_it jsonb;
  v_linea record;
  v_cantidad integer;
  v_nota text;
  v_lote text;
  v_venc date;
  v_lineas integer := 0;
  v_unidades integer := 0;
  v_faltan integer := 0;
begin
  select id, codigo, numero, pais_id, etapa, anulada_en into v_compra from wms_compras where id = p_compra for update;
  if not found then raise exception 'La compra no existe.'; end if;
  if v_compra.anulada_en is not null or v_compra.etapa = 'descartado' then raise exception 'Esa compra está anulada o descartada.'; end if;
  select tipo, activa, pais_id, nombre into v_bodega from wms_bodegas where id = p_bodega;
  if not found then raise exception 'La bodega no existe.'; end if;
  if v_bodega.tipo <> 'propia' or not v_bodega.activa then raise exception 'Una compra se recibe en una bodega propia y activa.'; end if;
  if v_bodega.pais_id is distinct from v_compra.pais_id then raise exception 'La bodega no es del país de la compra.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'No hay productos para recibir.'; end if;

  for v_it in select * from jsonb_array_elements(p_items) loop
    select i.id, i.sku_maestro_id, i.cantidad_pedida, i.cantidad_recibida, i.notas, s.codigo, s.clase, s.tipo, s.maneja_vencimiento, s.opciones_variantes
      into v_linea
      from wms_compra_items i join skus_maestros s on s.id = i.sku_maestro_id
      where i.id = (v_it ->> 'item')::uuid and i.compra_id = p_compra
      for update of i;
    if not found then raise exception 'Un producto no es de esta compra.'; end if;
    if v_linea.cantidad_recibida is not null then raise exception '% ya se recibió.', v_linea.codigo; end if;
    if v_linea.tipo = 'combo' then raise exception '% es un compuesto: no guarda stock.', v_linea.codigo; end if;
    if v_linea.clase = 'test' then raise exception '% está en Test: pásalo a Activo antes de recibirlo.', v_linea.codigo; end if;
    if v_linea.opciones_variantes is not null then raise exception '% tiene variantes: en la compra elige la variante.', v_linea.codigo; end if;

    v_cantidad := (v_it ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad < 0 then raise exception 'La cantidad de % no es válida.', v_linea.codigo; end if;
    v_nota := nullif(btrim(coalesce(v_it ->> 'nota', '')), '');
    if v_cantidad <> v_linea.cantidad_pedida and v_nota is null then
      raise exception 'Se pidieron % de % y llegaron %: anota qué pasó.', v_linea.cantidad_pedida, v_linea.codigo, v_cantidad;
    end if;
    v_lote := nullif(btrim(coalesce(v_it ->> 'lote_codigo', '')), '');
    v_venc := nullif(v_it ->> 'vencimiento', '')::date;
    if v_linea.maneja_vencimiento and v_cantidad > 0 and (v_lote is null or v_venc is null) then
      raise exception '% maneja vencimiento: falta el lote y su fecha.', v_linea.codigo;
    end if;

    update wms_compra_items
      set cantidad_recibida = v_cantidad,
          fecha_recepcion = (now() at time zone 'America/Panama')::date,
          bodega_id = p_bodega,
          notas = case when v_nota is null then notas else concat_ws(' · ', nullif(notas, ''), v_nota) end,
          actualizado_en = now()
      where id = v_linea.id;
    if v_cantidad > 0 then
      perform wms_registrar_movimiento(
        v_linea.sku_maestro_id, p_bodega, 'entrada', v_cantidad, nullif(v_it ->> 'ubicacion', '')::uuid, 'compra', coalesce(v_compra.codigo, 'Compra'),
        coalesce('Recepción de compra · ' || v_nota, 'Recepción de compra'), p_usuario, null, case when v_linea.maneja_vencimiento then v_lote end, case when v_linea.maneja_vencimiento then v_venc end
      );
    end if;
    v_lineas := v_lineas + 1;
    v_unidades := v_unidades + v_cantidad;
    v_faltan := v_faltan + greatest(v_linea.cantidad_pedida - v_cantidad, 0);
  end loop;
  return jsonb_build_object('lineas', v_lineas, 'unidades', v_unidades, 'faltan', v_faltan);
end;
$$;

revoke all on function wms_recibir_compra(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
