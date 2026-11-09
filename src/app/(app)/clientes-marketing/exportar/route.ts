import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { ETIQUETA_CALIDAD, CALIDADES } from "@/lib/clientes/identidad";
import { DIAS_LTV, DIAS_RECOMPRA, ETIQUETA_PLATAFORMA, TODAS, ltv, recompra } from "@/lib/clientes/metricas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosPagina, hoyPanama, indicadoresDe } from "../datos";

type Celda = string | number | null;
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
const r4 = (n: number | null) => (n === null ? null : Math.round(n * 10000) / 10000);

/** Formato de números: % en las columnas que son fracciones, «×» en las razones y dinero en el resto. */
function hoja(filas: Celda[][], formatos: Record<number, string>, anchos: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  const rango = XLSX.utils.decode_range(ws["!ref"]!);
  for (let r = 1; r <= rango.e.r; r++) {
    for (const [c, z] of Object.entries(formatos)) {
      const celda = ws[XLSX.utils.encode_cell({ r, c: Number(c) })];
      if (celda && typeof celda.v === "number") celda.z = z;
    }
  }
  return ws;
}

const PCT = "0.0%";
const USD = "#,##0.00;[Red]-#,##0.00";
const VECES = '0.00"×"';
const ENTERO = "#,##0";

/** Clientes y marketing en Excel (sin datos personales): por tienda y mes, cohortes, gasto por plataforma y calidad. */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("clientes-marketing")) return new NextResponse("No autorizado", { status: 403 });
  const datos = await cargarDatosPagina(createServiceClient(), Object.fromEntries(req.nextUrl.searchParams));
  if ("error" in datos) return new NextResponse("Falta la migración 0920.", { status: 500 });
  const nombre = (id: string) => (id === TODAS ? "Todas" : (datos.nombresUnidades[id] ?? "—"));

  const wb = XLSX.utils.book_new();
  const ambitos = [TODAS, ...datos.tiendas.map((t) => t.id)];

  // 1. Por tienda y mes
  const enc1 = ["Mes", "Tienda", "Órdenes", "Entregadas", "Compraron", "Clientes nuevos", "Recurrentes", "Ventas entregadas", "Margen de contribución", "Marketing", "CAC", "Recompra 90 días", "LTV 180 días", "LTV/CAC", "ROAS", "ROAS de margen", "Libro"];
  const f1: Celda[][] = [enc1];
  for (const m of datos.conDatos) {
    for (const a of ambitos) {
      const i = indicadoresDe(datos, a, [m]);
      if (!i.ordenes && !i.gasto) continue;
      const libro = datos.mesesLibro.has(m);
      f1.push([m.slice(0, 7), nombre(a), i.ordenes, i.entregadas, i.compradores, i.nuevos, i.recurrentes, r2(i.ventas), r2(i.margen), libro ? r2(i.gasto) : null, r2(i.cac), r4(i.recompra90), r2(i.ltv180), r2(i.ltvCac), r2(i.roas), r2(i.poas), libro ? "Sí" : "No"]);
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    hoja(f1, { 2: ENTERO, 3: ENTERO, 4: ENTERO, 5: ENTERO, 6: ENTERO, 7: USD, 8: USD, 9: USD, 10: USD, 11: PCT, 12: USD, 13: VECES, 14: VECES, 15: VECES }, [9, 16, ...enc1.slice(2).map(() => 13)]),
    "Por tienda y mes",
  );

  // 2. Cohortes
  const enc2 = ["Tienda", "Cohorte", "Clientes", ...DIAS_RECOMPRA.map((d) => `Recompra ${d} días`), ...DIAS_LTV.map((d) => `LTV ${d} días`), ...DIAS_RECOMPRA.map((d) => `Maduros ${d} días`), "Maduros 365 días", "Entregas"];
  const f2: Celda[][] = [enc2];
  for (const c of [...datos.cohortes].sort((a, b) => (a.ambito === TODAS ? -1 : 0) - (b.ambito === TODAS ? -1 : 0) || nombre(a.ambito).localeCompare(nombre(b.ambito)) || a.cohorte.localeCompare(b.cohorte))) {
    f2.push([
      nombre(c.ambito),
      c.cohorte.slice(0, 7),
      c.clientes,
      ...DIAS_RECOMPRA.map((d) => r4(recompra(c, d))),
      ...DIAS_LTV.map((d) => r2(ltv(c, d))),
      ...DIAS_RECOMPRA.map((d) => c[`maduros_${d}`]),
      c.maduros_365,
      c.entregadas,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, hoja(f2, { 2: ENTERO, 3: PCT, 4: PCT, 5: PCT, 6: PCT, 7: USD, 8: USD, 9: USD }, [16, 9, ...enc2.slice(2).map(() => 13)]), "Cohortes");

  // 3. Marketing por plataforma
  const f3: Celda[][] = [["Mes", "Unidad", "Plataforma", "Gasto"]];
  for (const g of datos.marketing) f3.push([g.periodo.slice(0, 7), nombre(g.unidad_id), ETIQUETA_PLATAFORMA[g.plataforma], r2(g.gasto)]);
  XLSX.utils.book_append_sheet(wb, hoja(f3, { 3: USD }, [9, 16, 14, 12]), "Marketing");

  // 4. Calidad de la identidad
  const q = datos.calidad;
  const f4: Celda[][] = [["Dato", "Cantidad"]];
  for (const c of CALIDADES) f4.push([`Órdenes con teléfono: ${ETIQUETA_CALIDAD[c]}`, q.ordenesPorCalidad[c]]);
  f4.push(["Clientes por teléfono", q.clientesPorTipo.telefono], ["Clientes por correo", q.clientesPorTipo.correo], ["Órdenes sin dato (cliente de una orden)", q.clientesPorTipo.orden], ["Órdenes sin cliente todavía", q.ordenesSinCliente]);
  XLSX.utils.book_append_sheet(wb, hoja(f4, { 1: ENTERO }, [40, 12]), "Calidad");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Clientes-marketing-${hoyPanama()}.xlsx"`,
    },
  });
}
