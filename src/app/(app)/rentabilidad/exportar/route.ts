import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { mesCorto } from "@/lib/finanzas/eerr";
import { economia, sobreVentas, sumarCascadas, type Cascada } from "@/lib/finanzas/rentabilidad";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosPagina, hoyPanama } from "../datos";
import { ETIQUETA_FUENTE } from "../formato";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fr = (p: number | null) => (p === null ? null : Math.round(p * 10) / 1000);

const ENCABEZADO = [
  "Ventas",
  "%",
  "Fuente ventas",
  "Mercancía",
  "%",
  "Fuente mercancía",
  "Otros costos de venta",
  "%",
  "Margen bruto",
  "%",
  "Envío y delivery",
  "%",
  "Fuente envío",
  "Marketing",
  "%",
  "Margen de contribución",
  "%",
  "Administración",
  "%",
  "EBITDA",
  "%",
  "Órdenes",
  "Entregadas",
  "Contribución por entregada",
];

function fila(etiqueta: string, c: Cascada): (string | number | null)[] {
  const m = (v: number) => [r2(v), fr(sobreVentas(v, c))];
  return [
    etiqueta,
    ...m(c.ventas.valor),
    ETIQUETA_FUENTE[c.ventas.fuente],
    ...m(c.mercancia.valor),
    ETIQUETA_FUENTE[c.mercancia.fuente],
    ...m(c.otrosVariables),
    ...m(c.margenBruto),
    ...m(c.envio.valor),
    ETIQUETA_FUENTE[c.envio.fuente],
    ...m(c.marketing),
    ...m(c.contribucion),
    ...m(c.administracion),
    ...m(c.ebitda),
    c.ordenes,
    c.entregadas,
    economia(c).contribucionPorEntregada === null ? null : r2(economia(c).contribucionPorEntregada!),
  ];
}

function hoja(titulo: string, primera: string, filas: [string, Cascada][]): XLSX.WorkSheet {
  const datos: (string | number | null)[][] = [[titulo], [], [primera, ...ENCABEZADO]];
  for (const [e, c] of filas) datos.push(fila(e, c));
  datos.push(fila("Total", sumarCascadas(filas.map(([, c]) => c))));
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws["!cols"] = [{ wch: 18 }, ...ENCABEZADO.map((h) => ({ wch: h.length > 3 ? 14 : 7 }))];
  const pcts = new Set(ENCABEZADO.map((h, i) => (h === "%" ? i + 1 : -1)));
  const rango = XLSX.utils.decode_range(ws["!ref"]!);
  for (let r = 3; r <= rango.e.r; r++) {
    for (let c = 1; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda && typeof celda.v === "number") celda.z = pcts.has(c) ? "0.0%" : "#,##0.00;[Red]-#,##0.00";
    }
  }
  return ws;
}

/** La cascada de margen en Excel: por tienda (o por mes de la tienda elegida) y por tienda y mes. */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("rentabilidad")) return new NextResponse("No autorizado", { status: 403 });
  const datos = await cargarDatosPagina(createServiceClient(), Object.fromEntries(req.nextUrl.searchParams));
  if ("error" in datos) return new NextResponse("Falta la migración 0915.", { status: 500 });
  const { periodo, tienda, porTienda, porMes, porTiendaMes, nombre } = datos;

  const titulo = `Rentabilidad · ${periodo.etiqueta} · ${tienda?.nombre ?? "Todas las tiendas"} · USD`;
  const wb = XLSX.utils.book_new();
  const principal: [string, Cascada][] = tienda
    ? periodo.meses.filter((m) => porMes.has(m)).map((m) => [mesCorto(m), porMes.get(m)!])
    : [...porTienda].map(([id, c]) => [nombre(id), c] as [string, Cascada]).sort((a, b) => b[1].ventas.valor - a[1].ventas.valor);
  XLSX.utils.book_append_sheet(wb, hoja(titulo, tienda ? "Mes" : "Tienda", principal), "Cascada");
  const detalle: [string, Cascada][] = [...porTiendaMes]
    .filter(([k]) => porTienda.has(k.split("|")[1]))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, c]) => [`${mesCorto(k.split("|")[0])} · ${nombre(k.split("|")[1])}`, c]);
  XLSX.utils.book_append_sheet(wb, hoja(titulo, "Mes · tienda", detalle), "Por tienda y mes");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombreArchivo = `Rentabilidad-${(tienda?.nombre ?? "todas").replace(/[^\w.-]+/g, "_")}-${periodo.clave}-${hoyPanama()}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
