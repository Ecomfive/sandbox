import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "wms-productos";
const PREFIJO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

/**
 * La orden de compra que nace sola cuando un producto aprobado pasa de Test a Activo (pedido de Hernán, 12 oct 2026): en el país
 * de la barra de arriba, en la etapa «02 - Cotizar», con el nombre del producto, su foto (copiada: si se cambia la de la compra no
 * toca la del producto) y su SKU en la descripción. La cantidad y el costo se ponen al cotizar (una línea necesita cantidad).
 * Deja su evento de etapa y un comentario que explica de dónde salió. Devuelve lo creado o el motivo por el que no se pudo.
 */
export async function crearCompraDesdeProducto(opciones: {
  skuId: string;
  pais: { id: string; codigo: string; nombre: string };
  autor: string;
}): Promise<{ numero: number; codigo: string | null } | { error: string }> {
  const supabase = createServiceClient();
  const { data: sku } = await supabase.from("skus_maestros").select("codigo, nombre, foto_url").eq("id", opciones.skuId).maybeSingle();
  if (!sku) return { error: "El producto ya no existe." };

  // La foto del producto, copiada a la carpeta de compras.
  let foto: string | null = null;
  if (sku.foto_url && String(sku.foto_url).startsWith(PREFIJO)) {
    const origen = String(sku.foto_url).slice(PREFIJO.length);
    const destino = `compras/${crypto.randomUUID()}/${origen.split("/").pop()}`;
    const { error } = await supabase.storage.from(BUCKET).copy(origen, destino);
    if (!error) foto = PREFIJO + destino;
  }

  const { data: codigo } = await supabase.rpc("wms_siguiente_codigo_compra", { p_clave: opciones.pais.codigo });
  const { data: compra, error } = await supabase
    .from("wms_compras")
    .insert({
      tipo: "pais",
      pais_id: opciones.pais.id,
      codigo: (codigo as string | null) ?? null,
      nombre: String(sku.nombre),
      etapa: "cotizar",
      estado: "pendiente",
      foto_url: foto,
      descripcion: `Producto ${sku.codigo} · ${sku.nombre}. Orden creada sola al pasar el producto de Test a Activo.`,
      responsable_nombre: opciones.autor,
      creador_nombre: opciones.autor,
    })
    .select("id, numero, codigo")
    .single();
  if (error || !compra) return { error: "No se pudo crear la orden de compra." };

  await supabase.from("wms_compra_eventos").insert([
    { compra_id: compra.id, campo: "etapa", valor_antes: null, valor_despues: "cotizar", autor: opciones.autor, origen: "sistema" },
    { compra_id: compra.id, campo: "estado", valor_antes: null, valor_despues: "pendiente", autor: opciones.autor, origen: "sistema" },
  ]);
  await supabase.from("wms_compra_comentarios").insert({
    compra_id: compra.id,
    autor: opciones.autor,
    texto: `Orden creada automáticamente: el producto ${sku.codigo} · ${sku.nombre} pasó de Test a Activo. Falta agregarlo en «Productos» con la cantidad y el costo al cotizar.`,
  });
  return { numero: Number(compra.numero), codigo: (compra.codigo as string | null) ?? null };
}
