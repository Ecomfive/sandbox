// Desempeño › Ventas Dropi (migraciones 0120 y 0122): carga el Historial de Existencia de Dropi (cada movimiento de stock de cada
// producto, `movimientos`) y la lista de productos (`resumen`: nombre, lista, si es privado y su stock) que lee
// ventas-dropi-navegador.js. Agrupa por producto y día en hora de Panamá, y por dropshipper (lo cancelado o devuelto se le carga a
// quien creó la orden). Cada carga reemplaza lo de los productos que trae; los que ya no vienen (eliminados en Dropi) conservan su
// historia, archivados y sin stock. El resumen por dropshipper sí se reemplaza entero (es una foto de hoy). Lo usan
// scripts/importar-ventas-dropi.ts y «Actualizar Dropi».

import type { SupabaseClient } from "@supabase/supabase-js";
import { netas, restarDias } from "@/lib/publicaciones/ventas";

/** [id, clase, cantidad, fecha UTC «YYYY-MM-DDTHH:mm», orden, usuario, bodega, existencia después, variación] */
type Mov = [number, number, number, string, number | null, number | null, number | null, number, number | null];
export interface MovimientosDropi {
  clases: string[];
  usuarios: Record<string, string>;
  movimientos: Record<string, Mov[]>;
}
export interface ResumenDropi {
  generado: string;
  cabecera: string[];
  productos: unknown[][];
}

const NEGATIVAS = new Set(["cancelada", "rechazada", "devolucion"]);
const diaPanama = (utc: string) => new Date(new Date(`${utc}:00Z`).getTime() - 5 * 3600e3).toISOString().slice(0, 10);

/** Arma las filas de la carga (sin base). */
export function armarVentas(M: MovimientosDropi, R: ResumenDropi, paisId: string) {
  const corteFecha = diaPanama(R.generado.slice(0, 16));
  const clase = (i: number) => M.clases[i];
  const col = (k: string) => R.cabecera.indexOf(k);
  const productos: Record<string, unknown>[] = [];
  const diarias: Record<string, unknown>[] = [];
  const ds = new Map<number, { pedidas: number; ordenes: Set<number>; negativas: number; n30: number; productos: Set<number>; ultima: string | null }>();
  const desde30 = restarDias(corteFecha, 29);
  // Cada dropshipper por producto y mes (migración 0122), para su ficha del CRM.
  const dsMes = new Map<string, { usuario: number; producto: number; mes: string; pedidas: number; ordenes: Set<number>; noEfectivas: number }>();
  let movimientos = 0;

  for (const p of R.productos) {
    const id = Number(p[col("id")]);
    const movs = M.movimientos[String(id)] ?? [];
    movimientos += movs.length;
    const creador = new Map(movs.filter((m) => clase(m[1]) === "pedido" && m[4] !== null && m[5] !== null).map((m) => [m[4]!, m[5]!]));
    const ultBodega = new Map<number, Mov>();
    const porDia = new Map<string, { pedidas: number; ordenes: Set<number>; canceladas: number; rechazadas: number; devueltas: number }>();
    let primera: string | null = null;
    let ultima: string | null = null;
    for (const m of movs) {
      const bodega = m[6] ?? 0;
      const previo = ultBodega.get(bodega);
      if (!previo || m[0] > previo[0]) ultBodega.set(bodega, m);
      const c = clase(m[1]);
      if (c !== "pedido" && !NEGATIVAS.has(c)) continue;
      const dia = diaPanama(m[3]);
      const d = porDia.get(dia) ?? { pedidas: 0, ordenes: new Set<number>(), canceladas: 0, rechazadas: 0, devueltas: 0 };
      porDia.set(dia, d);
      if (c === "pedido") {
        d.pedidas += m[2];
        if (m[4] !== null) d.ordenes.add(m[4]);
        if (!primera || dia < primera) primera = dia;
        if (!ultima || dia > ultima) ultima = dia;
      } else if (c === "cancelada") d.canceladas += m[2];
      else if (c === "rechazada") d.rechazadas += m[2];
      else d.devueltas += m[2];
      // Dropshipper: quien creó la orden (en Dropi, una cancelación queda a nombre de quien la procesa).
      const quien = c === "pedido" ? m[5] : m[4] !== null ? (creador.get(m[4]) ?? null) : null;
      if (quien === null) continue;
      const x = ds.get(quien) ?? { pedidas: 0, ordenes: new Set<number>(), negativas: 0, n30: 0, productos: new Set<number>(), ultima: null };
      ds.set(quien, x);
      const signo = c === "pedido" ? 1 : -1;
      const claveMes = `${quien}|${id}|${dia.slice(0, 7)}`;
      const xm = dsMes.get(claveMes) ?? { usuario: quien, producto: id, mes: `${dia.slice(0, 7)}-01`, pedidas: 0, ordenes: new Set<number>(), noEfectivas: 0 };
      dsMes.set(claveMes, xm);
      if (c === "pedido") {
        xm.pedidas += m[2];
        if (m[4] !== null) xm.ordenes.add(m[4]);
        x.pedidas += m[2];
        if (m[4] !== null) x.ordenes.add(m[4]);
        x.productos.add(id);
        if (!x.ultima || dia > x.ultima) x.ultima = dia;
      } else {
        xm.noEfectivas += m[2];
        x.negativas += m[2];
      }
      if (dia >= desde30 && dia <= corteFecha) x.n30 += signo * m[2];
    }
    productos.push({
      pais_id: paisId,
      dropi_producto_id: id,
      nombre: String(p[col("nombre")]),
      lista: p[col("lista")] === "archivado" ? "archivado" : "activo",
      privado: !!p[col("privado")],
      variable: p[col("tipo")] === "V",
      // El stock que da Dropi en la lista de productos; si no viene, el de después del último movimiento de cada bodega.
      stock: col("stock") >= 0 && p[col("stock")] !== null ? Number(p[col("stock")]) : [...ultBodega.values()].reduce((a, m) => a + m[7], 0),
      primera_venta: primera,
      ultima_venta: ultima,
      actualizado_en: R.generado,
    });
    for (const [dia, d] of porDia) diarias.push({ pais_id: paisId, dropi_producto_id: id, dia, pedidas: d.pedidas, ordenes: d.ordenes.size, canceladas: d.canceladas, rechazadas: d.rechazadas, devueltas: d.devueltas });
  }
  const dropshippers = [...ds.entries()]
    .filter(([, x]) => x.pedidas > 0)
    .map(([usuario, x]) => ({ pais_id: paisId, dropi_usuario_id: usuario, nombre: M.usuarios[String(usuario)] ?? `Usuario ${usuario}`, pedidas: x.pedidas, ordenes: x.ordenes.size, no_efectivas: x.negativas, netas_30d: x.n30, productos: x.productos.size, ultima_orden: x.ultima }));
  const porMes = [...dsMes.values()].map((x) => ({ pais_id: paisId, dropi_usuario_id: x.usuario, dropi_producto_id: x.producto, mes: x.mes, pedidas: x.pedidas, ordenes: x.ordenes.size, no_efectivas: x.noEfectivas }));
  const netasTotal = diarias.reduce((a, d) => a + netas(d as never), 0);
  return { corteFecha, productos, diarias, dropshippers, porMes, movimientos, netasTotal };
}

/** Reemplaza la carga de ventas de Panamá con esta lectura. `log` recibe los avisos. */
export async function ingerirVentas(supabase: SupabaseClient, M: MovimientosDropi, R: ResumenDropi, log: (texto: string) => void = () => {}) {
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", "PA").single();
  if (!pais) throw new Error("No está el país PA.");
  const v = armarVentas(M, R, pais.id as string);
  const enTandas = async (tabla: string, filas: Record<string, unknown>[]) => {
    for (let i = 0; i < filas.length; i += 1000) {
      const { error } = await supabase.from(tabla).insert(filas.slice(i, i + 1000));
      if (error) throw new Error(`${tabla}: ${error.message}`);
    }
  };
  const ids = v.productos.map((p) => Number(p.dropi_producto_id));
  const { data: previos, error: errPrevios } = await supabase.from("dropi_ventas_productos").select("dropi_producto_id").eq("pais_id", pais.id).limit(20000);
  if (errPrevios) throw new Error(/does not exist|schema cache/.test(errPrevios.message) ? "Falta correr la migración 0120." : errPrevios.message);
  const nuevos = new Set(ids);
  const conservados = (previos ?? []).map((x) => Number(x.dropi_producto_id)).filter((id) => !nuevos.has(id));
  for (let i = 0; i < ids.length; i += 300) {
    const tanda = ids.slice(i, i + 300);
    for (const t of ["dropi_ventas_diarias", "dropi_ventas_productos", "dropi_ventas_dropshipper_mes"]) {
      const { error } = await supabase.from(t).delete().eq("pais_id", pais.id).in("dropi_producto_id", tanda);
      if (error) throw new Error(/does not exist|schema cache/.test(error.message) ? `Falta correr la migración ${t === "dropi_ventas_dropshipper_mes" ? "0122" : "0120"}.` : `${t}: ${error.message}`);
    }
  }
  for (let i = 0; i < conservados.length; i += 300) {
    const { error } = await supabase.from("dropi_ventas_productos").update({ lista: "archivado", stock: 0 }).eq("pais_id", pais.id).in("dropi_producto_id", conservados.slice(i, i + 300));
    if (error) throw new Error(`Conservar los que ya no vienen: ${error.message}`);
  }
  if (conservados.length) log(`${conservados.length} productos ya no vienen en Dropi (eliminados): se conserva su historia, archivados y sin stock.`);
  {
    const { error } = await supabase.from("dropi_ventas_dropshippers").delete().eq("pais_id", pais.id);
    if (error) throw new Error(`dropi_ventas_dropshippers: ${error.message}`);
  }
  await enTandas("dropi_ventas_productos", v.productos);
  await enTandas("dropi_ventas_diarias", v.diarias);
  await enTandas("dropi_ventas_dropshippers", v.dropshippers);
  await enTandas("dropi_ventas_dropshipper_mes", v.porMes);
  const { error } = await supabase.from("dropi_ventas_cargas").insert({ pais_id: pais.id, corte: R.generado, productos: v.productos.length, movimientos: v.movimientos });
  if (error) throw new Error(`dropi_ventas_cargas: ${error.message}`);
  return { corte: v.corteFecha, productos: v.productos.length, movimientos: v.movimientos, netas: v.netasTotal, dropshippers: v.dropshippers.length };
}
