// Lee un archivo de ordenes ya extraido (ver dropi-extraer-ordenes.ts) y lo
// guarda en Supabase: primero crudo en staging_ordenes_dropi, luego
// normalizado en productos/ordenes, todo por lotes para no hacer miles de
// idas y vueltas a la base.
//
// Uso: npx tsx scripts/dropi-ingerir-ordenes.ts <cr|pa> <archivo.json>
//
// Nota: cada orden de Dropi puede traer varios productos (orderdetails es un
// arreglo), pero el esquema actual de `ordenes` guarda un solo producto por
// fila. Como en los datos reales vistos hasta ahora cada orden trae
// mayormente un solo producto, se usa el primero y se deja constancia si
// algún día aparece un caso con más de uno. Algunos productos de Dropi
// tienen `sku` null (dato faltante de su lado); en ese caso se usa el id
// interno de Dropi del producto como identificador estable.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const pais = process.argv[2];
const archivo = process.argv[3];

if (!["cr", "pa"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-ordenes.ts <cr|pa> <archivo.json>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

interface OrdenDropi {
  id: number;
  status: string;
  total_order: number;
  created_at: string;
  orderdetails: {
    product: { id: number; sku: string | null; name: string };
  }[];
}

function* enLotes<T>(items: T[], tamano: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += tamano) yield items.slice(i, i + tamano);
}

async function main() {
  const ordenes: OrdenDropi[] = JSON.parse(readFileSync(archivo, "utf8"));
  console.log(`Leidas ${ordenes.length} ordenes de ${archivo}`);

  const codigoPais = pais.toUpperCase();
  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", codigoPais).single();
  const { data: plataformaRow } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!paisRow || !plataformaRow) {
    throw new Error("Falta pais o plataforma Dropi. Corre las migraciones.");
  }

  const { data: cuentaRow } = await supabase
    .from("cuentas_extraccion")
    .select("id")
    .eq("pais_id", paisRow.id)
    .eq("plataforma_id", plataformaRow.id)
    .eq("tipo", "proveedor")
    .single();

  if (!cuentaRow) {
    throw new Error("Falta la cuenta de extraccion Dropi proveedor. Corre las migraciones.");
  }

  const paisId = paisRow.id;
  const plataformaId = plataformaRow.id;

  for (const lote of enLotes(ordenes, 500)) {
    const { error } = await supabase
      .from("staging_ordenes_dropi")
      .insert(lote.map((o) => ({ cuenta_extraccion_id: cuentaRow.id, payload: o })));
    if (error) throw new Error(`Error guardando staging: ${error.message}`);
  }
  console.log(`Guardadas ${ordenes.length} filas en staging_ordenes_dropi.`);

  const { data: productosExistentes } = await supabase
    .from("productos")
    .select("id, sku")
    .eq("pais_id", paisId)
    .eq("plataforma_id", plataformaId);

  const skuAId = new Map((productosExistentes ?? []).map((p) => [p.sku, p.id as string]));
  const skuANombreNuevo = new Map<string, string>();
  let multiProducto = 0;
  let sinProducto = 0;

  const conSku = ordenes.map((orden) => {
    if (orden.orderdetails.length > 1) multiProducto++;
    const detalle = orden.orderdetails[0];
    if (!detalle) {
      sinProducto++;
      return { orden, sku: null as string | null };
    }
    const sku = detalle.product.sku ?? `dropi-${detalle.product.id}`;
    if (!skuAId.has(sku) && !skuANombreNuevo.has(sku)) {
      skuANombreNuevo.set(sku, detalle.product.name || sku);
    }
    return { orden, sku };
  });

  if (skuANombreNuevo.size > 0) {
    const nuevos = Array.from(skuANombreNuevo, ([sku, nombre]) => ({
      pais_id: paisId,
      plataforma_id: plataformaId,
      sku,
      nombre,
    }));
    for (const lote of enLotes(nuevos, 500)) {
      const { data: creados, error } = await supabase.from("productos").insert(lote).select("id, sku");
      if (error) throw new Error(`Error creando productos: ${error.message}`);
      for (const c of creados ?? []) skuAId.set(c.sku, c.id);
    }
    console.log(`Creados ${skuANombreNuevo.size} productos nuevos.`);
  }

  // Una extraccion larga puede tomar minutos y la paginacion de Dropi no es
  // atomica, asi que la misma orden puede aparecer en mas de una pagina si
  // se crean ordenes nuevas mientras se pagina. Nos quedamos con una fila
  // por referencia_externa antes de guardar.
  const filasPorReferencia = new Map<string, ReturnType<typeof filaDeOrden>>();
  function filaDeOrden(orden: OrdenDropi, sku: string) {
    return {
      pais_id: paisId,
      plataforma_id: plataformaId,
      producto_id: skuAId.get(sku),
      referencia_externa: String(orden.id),
      cantidad: orden.orderdetails.length,
      monto: orden.total_order,
      estado: orden.status,
      fecha: orden.created_at.slice(0, 10),
      fecha_hora: orden.created_at,
    };
  }
  for (const { orden, sku } of conSku) {
    if (sku === null) continue;
    filasPorReferencia.set(String(orden.id), filaDeOrden(orden, sku));
  }
  const duplicadas = conSku.filter((o) => o.sku !== null).length - filasPorReferencia.size;
  const filasOrdenes = Array.from(filasPorReferencia.values());

  for (const lote of enLotes(filasOrdenes, 500)) {
    const { error } = await supabase
      .from("ordenes")
      .upsert(lote, { onConflict: "plataforma_id,referencia_externa" });
    if (error) throw new Error(`Error guardando ordenes: ${error.message}`);
  }

  console.log(`Normalizadas ${filasOrdenes.length} ordenes.`);
  if (duplicadas > 0) {
    console.log(`Aviso: ${duplicadas} ordenes aparecian repetidas entre paginas (misma orden, una fila).`);
  }
  if (multiProducto > 0) {
    console.log(`Aviso: ${multiProducto} ordenes traian mas de un producto; solo se guardo el primero.`);
  }
  if (sinProducto > 0) {
    console.log(`Aviso: ${sinProducto} ordenes no traian ningun producto y se omitieron.`);
  }
}

main();
