import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarFlujo } from "@/lib/finanzas/cargar-flujo";
import { contextoEntidad } from "@/lib/finanzas/contexto-entidad";
import { mesCorto } from "@/lib/finanzas/eerr";
import { filasEstadoFlujo, filasPorCuenta, resumirFlujo, ventanaPedida } from "@/lib/finanzas/flujo";
import { escribirLibro, hojaPlanilla } from "@/lib/finanzas/excel-formulas";
import { planillaFlujo, planillaPorCuenta } from "@/lib/finanzas/excel-reportes";

/** El Flujo de caja en Excel (`?desde=AAAA-MM&hasta=AAAA-MM`): hoja «Flujo» (el estado) y hoja «Por cuenta». */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("flujo-caja")) return new NextResponse("No autorizado", { status: 403 });
  const supabase = createServiceClient();
  const { vista } = await contextoEntidad(supabase, Object.fromEntries(req.nextUrl.searchParams));
  const datos = await cargarFlujo(supabase, { entidadId: vista.entidad?.id ?? null, monedaLocal: vista.local ? vista.moneda : null });
  if ("error" in datos) return new NextResponse(datos.error, { status: 500 });
  const meses = ventanaPedida(req.nextUrl.searchParams.get("desde"), req.nextUrl.searchParams.get("hasta"), datos.disponibles);
  if (!meses.length) return new NextResponse("Sin datos de flujo.", { status: 404 });
  const r = resumirFlujo(datos.filas, datos.saldos, datos.cuentas, meses, datos.conversion);
  const sufijo = [vista.entidad?.razon_social, vista.moneda].filter(Boolean).join(" · ");

  const columnas = meses.map(mesCorto);
  const buffer = escribirLibro([
    { nombre: "Flujo", hoja: hojaPlanilla({ nombreHoja: "Flujo", titulo: `Flujo de caja · ${sufijo}`, columnas, filas: planillaFlujo(filasEstadoFlujo(r.estado, r.conSaldos ? r.caja : undefined, r.diferenciaCambio), meses) }) },
    { nombre: "Por cuenta", hoja: hojaPlanilla({ nombreHoja: "Por cuenta", titulo: `Flujo por cuenta · ${sufijo}`, columnas, filas: planillaPorCuenta(filasPorCuenta(r.cuentas, meses), meses) }) },
  ]);
  const nombre = `Flujo-de-caja-${vista.entidad ? `${vista.entidad.codigo}-` : ""}${meses[0].slice(0, 7)}-a-${meses[meses.length - 1].slice(0, 7)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
