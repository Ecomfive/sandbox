import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { diaConNombre, inicioSemanaPago, nombreTienda, TIENDAS_OCEANS } from "@/lib/despacho/control-envios";
import { cargarControl } from "@/lib/despacho/datos-control";
import { rangoDespacho } from "@/lib/despacho/datos";
import { SOLO_TODA_LA_EMPRESA } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

type Celda = string | number | null;

/**
 * Envíos Delivery › Control de envíos en Excel (`?semana=AAAA-MM-DD`, el jueves): una hoja con el resumen por delivery (como la tabla de la página) y
 * una con el detalle día por día de cada uno. Solo con Envíos Delivery y todas las tiendas.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("despacho-ciudad")) return new NextResponse("No autorizado", { status: 403 });
  if (await cargarTiendasPermitidas()) return new NextResponse(SOLO_TODA_LA_EMPRESA, { status: 403 });
  const pedido = req.nextUrl.searchParams.get("semana") ?? "";
  const jueves = inicioSemanaPago(/^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : rangoDespacho(1).hoy);
  const control = await cargarControl(createServiceClient(), jueves);
  if (!control) return new NextResponse("Falta la migración 0366.", { status: 500 });
  const tiendas = [...new Set([...TIENDAS_OCEANS, ...control.resumenes.flatMap((r) => Object.keys(r.porTienda))])];
  const resumen: Celda[][] = [
    ["Delivery", "Asignados", "Entregados", "Cambios y compl.", "Retiros", "Fallidos con evidencia", ...tiendas.map(nombreTienda), "Propinas", "Ajustes", "Total Oceans", "ClickSi (aparte)", "Recibo"],
    ...control.resumenes.map((r) => {
      const s = r.deliveryId ? control.semanas.get(r.deliveryId) : undefined;
      return [
        r.nombre + (r.prueba ? " (prueba)" : ""),
        r.asignados,
        r.entregados,
        r.cambios,
        r.retiros,
        r.fallidos,
        ...tiendas.map((t) => r.porTienda[t] ?? 0),
        r.propinas,
        r.ajustes,
        r.totalOceans,
        r.clicksi,
        s?.estado === "firmada" ? "Firmado" : s?.estado === "enviada" ? "Por firmar" : "Semana abierta",
      ];
    }),
  ];
  const dias: Celda[][] = [["Delivery", "Día", "Asignados", "Entregados", "Cambios y compl.", "Fallidos", "Retiros", "Pago"]];
  for (const r of control.resumenes) for (const d of r.dias) dias.push([r.nombre, diaConNombre(d.dia), d.asignados, d.entregados, d.cambios, d.fallidos, d.retiros, d.pago]);
  const wb = XLSX.utils.book_new();
  const h1 = XLSX.utils.aoa_to_sheet(resumen);
  h1["!cols"] = resumen[0].map((_, i) => ({ wch: i === 0 ? 22 : 13 }));
  const h2 = XLSX.utils.aoa_to_sheet(dias);
  h2["!cols"] = dias[0].map((_, i) => ({ wch: i === 0 ? 22 : 12 }));
  XLSX.utils.book_append_sheet(wb, h1, "Resumen");
  XLSX.utils.book_append_sheet(wb, h2, "Día por día");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="control-envios-${jueves}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
