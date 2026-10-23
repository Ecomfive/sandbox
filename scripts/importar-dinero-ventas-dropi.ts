// Desempeño › Ventas Dropi: carga la plata de cada producto (migración 0130) desde el Excel «ECOMFIVE DROPI 2026 DIARIO» de la
// oficina: hoja ÓRDENES (ganancia, comisión, coste real y descuentos de cada orden) y hoja COSTOS (el costo unitario de cada
// producto por mes, para repartir el coste de una orden de varios productos). El precio de proveedor de cada publicación (Gestión
// de IDs Dropi) reparte la ganancia. Cada carga reemplaza lo de los productos que trae; los que ya no vienen conservan su plata
// (22 oct 2026: un producto eliminado en Dropi no pierde su historia). Las reglas viven en src/lib/publicaciones/dinero.ts.
//
//   npx tsx scripts/importar-dinero-ventas-dropi.ts "<ruta del Excel>"            → informe (no escribe)
//   npx tsx scripts/importar-dinero-ventas-dropi.ts "<ruta del Excel>" --aplicar  → carga

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import * as X from "xlsx";
import { dineroPorDia, dineroPorMes, lineasDeProducto, utilidad, type OrdenDinero } from "../src/lib/publicaciones/dinero";
import { traerTodasLasFilas } from "../src/lib/supabase/paginar";

const archivo = process.argv[2];
const aplicar = process.argv.includes("--aplicar");
if (!archivo || archivo.startsWith("--")) {
  console.error('Uso: npx tsx scripts/importar-dinero-ventas-dropi.ts "<ruta del Excel>" [--aplicar]');
  process.exit(1);
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
type Celda = string | number | boolean | null | undefined;

/** «29.99», «4221,86», «1.234,50» → número (0 si no se entiende). */
function numero(v: Celda): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = String(v ?? "").trim();
  if (!t) return 0;
  const n = t.includes(",") && t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/** «3/31/26» (mes/día/año, como lo muestra el Sheet) → «2026-03-31». */
function fechaDeOrden(v: Celda): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function columnas(cab: Celda[], hoja: string, nombres: string[]): number[] {
  const c = cab.map((x) => String(x ?? "").trim().toUpperCase());
  return nombres.map((n) => {
    const i = c.indexOf(n);
    if (i < 0) throw new Error(`La hoja ${hoja} no tiene la columna «${n}».`);
    return i;
  });
}

async function main() {
  const wb = X.read(readFileSync(archivo), { type: "buffer", sheets: ["ÓRDENES", "COSTOS"], dense: true });
  const hoja = (n: string) => X.utils.sheet_to_json<Celda[]>(wb.Sheets[n], { header: 1, defval: null, raw: false });

  // ---------- COSTOS: costo unitario por mes y nombre de producto de Dropi ----------
  const filasCostos = hoja("COSTOS");
  const [kMes, kNombre, kUnit] = columnas(filasCostos[0], "COSTOS", ["MES", "PRODUCTO DROPI", "COSTO UNITARIO"]);
  const costos = new Map<string, number>();
  for (const f of filasCostos.slice(1)) {
    const m = /^(\d{1,2})-(\d{4})$/.exec(String(f[kMes] ?? "").trim());
    const u = numero(f[kUnit]);
    if (m && f[kNombre] && u > 0) costos.set(`${m[2]}-${m[1].padStart(2, "0")}|${String(f[kNombre]).trim().toUpperCase()}`, u);
  }

  // ---------- ÓRDENES ----------
  const filas = hoja("ÓRDENES");
  const [cId, cFecha, cEstatus, cGanancia, cComision, cProdId, cProducto, cCoste, cDesc] = columnas(filas[0], "ÓRDENES", [
    "ID",
    "FECHA",
    "ESTATUS",
    "GANANCIA",
    "COMISION",
    "PRODUCTO ID",
    "PRODUCTO",
    "COSTE REAL",
    "CARTERA - DESCUENTOS (GARANTÍA / INDEMNIZ.)",
  ]);
  const ordenes: OrdenDinero[] = [];
  const vistos = new Set<string>();
  let sinProducto = 0;
  for (const f of filas.slice(1)) {
    const id = String(f[cId] ?? "").trim();
    if (!/^\d+$/.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    const dia = fechaDeOrden(f[cFecha]);
    const productos = String(f[cProdId] ?? "").split("|").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
    if (!dia || !productos.length) {
      sinProducto++;
      continue;
    }
    const lineas = lineasDeProducto(String(f[cProducto] ?? ""));
    ordenes.push({
      dia,
      estatus: String(f[cEstatus] ?? "").trim().toUpperCase(),
      ganancia: numero(f[cGanancia]),
      comision: numero(f[cComision]),
      coste: numero(f[cCoste]),
      descuentos: Math.abs(numero(f[cDesc])),
      productos,
      unidades: productos.map((_, i) => lineas[i]?.unidades ?? 1),
      nombres: productos.map((_, i) => lineas[i]?.nombre ?? ""),
    });
  }

  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", "PA").single();
  if (!pais) throw new Error("No está el país PA.");
  // El precio de proveedor de cada publicación (un dropi_id puede traer dos: «7231-7679»).
  const pubs = await traerTodasLasFilas<{ dropi_id: string | null; precio_venta: number | null }>((d, h) =>
    supabase.from("dropi_publicaciones").select("dropi_id, precio_venta").eq("pais_id", pais.id).order("id").range(d, h),
  );
  const precios = new Map<number, number>();
  for (const p of pubs) for (const id of String(p.dropi_id ?? "").match(/\d{3,6}/g) ?? []) if (Number(p.precio_venta) > 0) precios.set(Number(id), Number(p.precio_venta));

  const dias = dineroPorDia(
    ordenes,
    (id) => precios.get(id) ?? null,
    (mes, nombre) => costos.get(`${mes}|${nombre.toUpperCase()}`) ?? null,
  );
  const meses = dineroPorMes(dias);
  const hasta = ordenes.map((o) => o.dia).sort().at(-1)!;
  const multi = ordenes.filter((o) => o.productos.length > 1).length;

  console.log(`Órdenes leídas: ${ordenes.length} (${multi} con varios productos; ${sinProducto} sin producto o sin fecha se saltan). Hasta el ${hasta}.`);
  console.log(`Costos del mes en COSTOS: ${costos.size} · precios de proveedor: ${precios.size}. Filas producto-día: ${dias.length} de ${new Set(dias.map((d) => d.producto)).size} productos.`);
  console.log("\nMes      | Entregadas | Ganancia     | Comisión   | Coste        | Descuentos | Utilidad");
  for (const [m, x] of [...meses].sort()) console.log(`${m}  | ${String(x.entregadas).padStart(10)} | ${usd(x.ganancia).padStart(12)} | ${usd(x.comision).padStart(10)} | ${usd(x.coste).padStart(12)} | ${usd(x.descuentos).padStart(10)} | ${usd(utilidad(x)).padStart(12)}`);
  // Comprobación: la suma repartida es la misma del Excel.
  const suma = (k: "ganancia" | "comision" | "coste" | "descuentos") => Math.round(ordenes.reduce((a, o) => a + o[k], 0) * 100) / 100;
  const repartido = (k: "ganancia" | "comision" | "coste" | "descuentos") => Math.round(dias.reduce((a, d) => a + d[k], 0) * 100) / 100;
  for (const k of ["ganancia", "comision", "coste", "descuentos"] as const) console.log(`  ${k}: Excel ${usd(suma(k))} · repartido ${usd(repartido(k))}`);

  if (!aplicar) {
    console.log("\nSolo informe. Para cargar: agrega --aplicar");
    return;
  }
  const idsCarga = [...new Set(dias.map((d) => d.producto))];
  for (let i = 0; i < idsCarga.length; i += 300) {
    const { error: errBorrar } = await supabase.from("dropi_ventas_dinero").delete().eq("pais_id", pais.id).in("dropi_producto_id", idsCarga.slice(i, i + 300));
    if (errBorrar) throw new Error(`dropi_ventas_dinero: ${errBorrar.message}`);
  }
  for (let i = 0; i < dias.length; i += 1000) {
    const { error } = await supabase.from("dropi_ventas_dinero").insert(
      dias.slice(i, i + 1000).map((d) => ({
        pais_id: pais.id,
        dropi_producto_id: d.producto,
        dia: d.dia,
        entregadas: d.entregadas,
        unidades: d.unidades,
        ganancia: d.ganancia,
        comision: d.comision,
        coste: d.coste,
        descuentos: d.descuentos,
      })),
    );
    if (error) throw new Error(`dropi_ventas_dinero: ${error.message}`);
  }
  const { error } = await supabase.from("dropi_ventas_dinero_cargas").insert({ pais_id: pais.id, fuente: basename(archivo), hasta, ordenes: ordenes.length });
  if (error) throw new Error(`dropi_ventas_dinero_cargas: ${error.message}`);
  console.log(`\nCargado: ${dias.length} filas de ${ordenes.length} órdenes.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
