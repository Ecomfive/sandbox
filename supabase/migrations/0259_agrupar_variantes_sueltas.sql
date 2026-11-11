-- Productos que eran variantes sueltas: se unifican en un producto base con sus variantes (9 nov 2026, pedido de Jhokser).
--
-- Había productos que son el mismo producto en distintos colores (BANDA/EJERCICIO/PEDALES/AZUL, /MORADO, /ROSA…) creados cada uno como producto
-- aparte. Aquí se crea el producto base (sin stock, con la foto de la primera variante que la tenga) y cada uno de ellos pasa a ser su variante,
-- con su valor (Color: Azul). Los productos que pasan a variantes CONSERVAN su id, su N.º, su SKU, su código de barras, su stock, sus compras,
-- sus publicaciones y sus fichas enlazadas: solo cambia que cuelgan de un producto base y ya no salen como filas sueltas en Producto.
--
--   * wms_agrupar_como_variantes(base, nombre, opcion, hijos, aplicar): con aplicar = false solo comprueba y dice qué haría. No cambia nada si
--     el SKU del base ya existe, si falta alguno de los productos, si alguno no es simple, ya es variante o ya tiene variantes, o si se repite
--     un valor. Cada grupo es independiente: uno que no se puede no impide los demás.
--   * Para simular antes: cambia `true` por `false` en la última consulta.
--   * La consulta final devuelve una fila por grupo con `hecho` y, si no se pudo, el `motivo`.
--   * No incluye, a propósito: BOLSAS/ROLLO y BOLSAS/BURBUJAS (insumos de empaque por medida, decisión de Alcides), ZAPATOS/ACUATICOS/MUJER,
--     FAJA/MALLA/CRUZADA (el SKU del base ya lo usa otro producto) ni los que se parecen en el nombre pero son modelos distintos.
-- Reversa: supabase/rollbacks/0259_rollback.sql

create or replace function wms_agrupar_como_variantes(p_codigo text, p_nombre text, p_opcion text, p_hijos jsonb, p_aplicar boolean default false)
returns jsonb language plpgsql as $$
declare
  v_item jsonb;
  v_fila record;
  v_motivos text[] := '{}';
  v_ids uuid[] := '{}';
  v_valores text[] := '{}';
  v_primero uuid;
  v_padre uuid;
  v_clase text;
  v_i int;
begin
  if coalesce(btrim(p_codigo), '') = '' or coalesce(btrim(p_nombre), '') = '' or coalesce(btrim(p_opcion), '') = '' then
    return jsonb_build_object('codigo', p_codigo, 'hecho', false, 'motivo', 'Faltan datos del producto base.');
  end if;
  if exists (select 1 from skus_maestros where lower(btrim(codigo)) = lower(btrim(p_codigo))) then
    return jsonb_build_object('codigo', p_codigo, 'hecho', false, 'motivo', 'Ya hay un producto con el SKU ' || p_codigo || ' (si ya se unificó antes, no hay nada que hacer).');
  end if;

  for v_item in select value from jsonb_array_elements(p_hijos) loop
    select id, tipo, padre_id, opciones_variantes into v_fila from skus_maestros where lower(btrim(codigo)) = lower(btrim(v_item->>'codigo'));
    if not found then
      v_motivos := v_motivos || ('No existe ' || (v_item->>'codigo'));
    elsif v_fila.tipo <> 'simple' then
      v_motivos := v_motivos || ((v_item->>'codigo') || ' no es un producto simple');
    elsif v_fila.padre_id is not null then
      v_motivos := v_motivos || ((v_item->>'codigo') || ' ya es una variante');
    elsif v_fila.opciones_variantes is not null then
      v_motivos := v_motivos || ((v_item->>'codigo') || ' ya tiene variantes');
    else
      v_ids := v_ids || v_fila.id;
      v_valores := v_valores || (v_item->>'valor');
    end if;
  end loop;
  if cardinality(v_ids) < 2 and cardinality(v_motivos) = 0 then
    v_motivos := v_motivos || 'Hacen falta al menos dos productos';
  end if;
  if (select count(distinct lower(x)) from unnest(v_valores) x) <> cardinality(v_valores) then
    v_motivos := v_motivos || 'Hay dos productos con el mismo valor';
  end if;
  if cardinality(v_motivos) > 0 then
    return jsonb_build_object('codigo', p_codigo, 'hecho', false, 'motivo', array_to_string(v_motivos, '; '));
  end if;
  if not p_aplicar then
    return jsonb_build_object('codigo', p_codigo, 'hecho', false, 'motivo', 'Simulación: se podría unificar', 'variantes', cardinality(v_ids));
  end if;

  -- El producto base se arma con los datos de la primera variante que tiene foto (o, si ninguna, de la primera).
  select id into v_primero from skus_maestros where id = any(v_ids) and foto_url is not null order by array_position(v_ids, id) limit 1;
  v_primero := coalesce(v_primero, v_ids[1]);
  v_clase := case when exists (select 1 from skus_maestros where id = any(v_ids) and clase = 'fisico') then 'fisico' else (select clase from skus_maestros where id = v_ids[1]) end;

  begin
    insert into skus_maestros (codigo, nombre, tipo, clase, estado, creado_por, foto_url, foto_huella, categoria_id, es_fisico, embalaje, largo, ancho, alto,
                               unidad_medida, peso, unidad_peso, pais_origen, codigo_sa, opciones_variantes)
    select p_codigo, p_nombre, 'simple', v_clase, estado, creado_por, foto_url, foto_huella, categoria_id, es_fisico, embalaje, largo, ancho, alto,
           unidad_medida, peso, unidad_peso, pais_origen, codigo_sa,
           jsonb_build_array(jsonb_build_object('nombre', p_opcion, 'valores', to_jsonb(v_valores)))
      from skus_maestros where id = v_primero
    returning id into v_padre;

    for v_i in 1 .. cardinality(v_ids) loop
      update skus_maestros set padre_id = v_padre, opciones = jsonb_build_object(p_opcion, v_valores[v_i]) where id = v_ids[v_i];
    end loop;
  exception when others then
    return jsonb_build_object('codigo', p_codigo, 'hecho', false, 'motivo', 'Error: ' || sqlerrm);
  end;
  return jsonb_build_object('codigo', p_codigo, 'hecho', true, 'variantes', cardinality(v_ids));
end;
$$;

-- Una fila por grupo: el SKU del producto base, si se unificó, cuántas variantes y, si no, el motivo.
select r->>'codigo' as base, r->>'hecho' as hecho, r->>'variantes' as variantes, r->>'motivo' as motivo
from (
  select wms_agrupar_como_variantes(g.codigo, g.nombre, g.opcion, g.hijos, true) as r
  from (values
    ('BANDA/EJERCICIO/PEDALES', 'Banda de Ejercicio con Pedales', 'Color', '[{"codigo":"BANDA/EJERCICIO/PEDALES/AZUL","valor":"Azul"},{"codigo":"BANDA/EJERCICIO/PEDALES/MORADO","valor":"Morado"},{"codigo":"BANDA/EJERCICIO/PEDALES/ROSA","valor":"Rosa"}]'::jsonb),
    ('BASE/MAQUILLAJE/ZEPHOCO', 'Base de maquillaje Zephoco', 'Tono', '[{"codigo":"BASE/MAQUILLAJE/ZEPHOCO/IVORY/WHITE","valor":"Ivory White"},{"codigo":"BASE/MAQUILLAJE/ZEPHOCO/NATURAL","valor":"Natural"},{"codigo":"BASE/MAQUILLAJE/ZEPHOCO/DARK","valor":"Dark"}]'::jsonb),
    ('BOLSO/NAYLA/GRAN', 'Bolso NAYLA de gran capacidad', 'Color', '[{"codigo":"BOLSO/NAYLA/GRAN/VERDE","valor":"Verde"},{"codigo":"BOLSO/NAYLA/GRAN/PURPURA","valor":"Púrpura"}]'::jsonb),
    ('BOLSO/GRAN/CAPACIDAD', 'Bolso Gran Capacidad', 'Color', '[{"codigo":"BOLSO/GRAN/CAPACIDAD/AZUL","valor":"Azul"},{"codigo":"BOLSO/GRAN/CAPACIDAD/LILA","valor":"Lila"},{"codigo":"BOLSO/GRAN/CAPACIDAD/GRIS","valor":"Gris"},{"codigo":"BOLSO/GRAN/CAPACIDAD/NEGRO","valor":"Negro"},{"codigo":"BOLSO/GRAN/CAPACIDAD/VERDE","valor":"Verde"}]'::jsonb),
    ('BOLSO/BANDOLERO/MULTICHIC', 'Bolso Bandolero Multichic', 'Color', '[{"codigo":"BOLSO/BANDOLERO/MULTICHIC/BEIGE","valor":"Beige"},{"codigo":"BOLSO/BANDOLERO/MULTICHIC/NEGRO","valor":"Negro"},{"codigo":"BOLSO/BANDOLERO/MULTICHIC/MARRON","valor":"Marrón"}]'::jsonb),
    ('BOLSO/CRUZADO/MUJER', 'Bolso Cruzado de Mujer', 'Color', '[{"codigo":"BOLSO/CRUZADO/MUJER/MARRON","valor":"Marrón"},{"codigo":"BOLSO/CRUZADO/MUJER/BLANCO","valor":"Blanco"}]'::jsonb),
    ('ARETES/COLOR', 'Aretes Color', 'Color', '[{"codigo":"ARETES/COLOR/ROSADO","valor":"Rosado"},{"codigo":"ARETES/COLOR/BLANCO","valor":"Blanco"}]'::jsonb),
    ('BRAZALETES/COLOR', 'Brazaletes Color', 'Color', '[{"codigo":"BRAZALETES/COLOR/PLATEADO","valor":"Plateado"},{"codigo":"BRAZALETES/COLOR/DORADO","valor":"Dorado"}]'::jsonb),
    ('CALCETIN/COBREVIDA', 'Calcetín Cobrevida', 'Color', '[{"codigo":"CALCETIN/COBREVIDA/ROSA","valor":"Rosa"},{"codigo":"CALCETIN/COBREVIDA/AZUL","valor":"Azul"}]'::jsonb),
    ('BRASIER/BELLARISE', 'Brasier Bellarise', 'Color', '[{"codigo":"BRASIER/BELLARISE/NEGRO","valor":"Negro"},{"codigo":"BRASIER/BELLARISE/BEIGE","valor":"Beige"}]'::jsonb),
    ('BRAGA/ENCAJE', 'Braga de Encaje', 'Color', '[{"codigo":"BRAGA/ENCAJE/ROSA","valor":"Rosa"},{"codigo":"BRAGA/ENCAJE/NEGRO","valor":"Negro"},{"codigo":"BRAGA/ENCAJE/SALMON","valor":"Salmón"}]'::jsonb),
    ('PANTY/COMPRESION/CRUZADA', 'Panty de Compresión Cruzada', 'Color', '[{"codigo":"PANTY/COMPRESION/CRUZADA/BEIGE","valor":"Beige"},{"codigo":"PANTY/COMPRESION/CRUZADA/NEGRO","valor":"Negro"}]'::jsonb),
    ('ZAPATOS/ACUATICOS', 'Zapatos Acuáticos', 'Color', '[{"codigo":"ZAPATOS/ACUATICOS/AZUL","valor":"Azul"},{"codigo":"ZAPATOS/ACUATICOS/VERDE","valor":"Verde"}]'::jsonb)
  ) as g(codigo, nombre, opcion, hijos)
) t;
