import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarEerr, unidadesEerr } from "@/lib/finanzas/cargar-eerr";
import { contextoEntidad } from "@/lib/finanzas/contexto-entidad";
import { mesCorto } from "@/lib/finanzas/eerr";
import { escribirLibro, hojaPlanilla } from "@/lib/finanzas/excel-formulas";
import { planillaEerr } from "@/lib/finanzas/excel-reportes";
import { eerrDelPeriodo, VENTANA_EERR } from "@/lib/af4/eerr-periodo";
import { hoyPanama, inicioDeMes, ultimosMeses } from "@/lib/af4/fecha";
import { filasEstado } from "@/lib/finanzas/eerr-filas";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { filtrarUnidades } from "@/lib/finanzas/tiendas-permitidas";

/**
 * El Estado de resultados en Excel, con las mismas filas y columnas que la página (`?ver=<id de tienda>` o todas, y el
 * mismo `?periodo=`: últimos 12 meses si no viene).
 * Los montos van como números y los subtotales, resultados y totales como fórmulas; el encabezado queda congelado.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("estado-resultados")) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const supabase = createServiceClient();
  const { vista } = await contextoEntidad(supabase, Object.fromEntries(req.nextUrl.searchParams));
  const unidades = await unidadesEerr(supabase, vista.entidad?.id ?? null);
  if ("error" in unidades) return new NextResponse("Falta la migración 0901.", { status: 500 });
  const ver = req.nextUrl.searchParams.get("ver");
  const permitidas = await cargarTiendasPermitidas();
  const unidad = filtrarUnidades(permitidas, unidades.unidades).find((u) => u.id === ver) ?? null;

  const hoy = hoyPanama();
  const cargado = await cargarEerr(supabase, unidad?.id ?? null, ultimosMeses(hoy, VENTANA_EERR), {
    entidadId: vista.entidad?.id ?? null,
    local: vista.local,
    unidades: !unidad && permitidas ? filtrarUnidades(permitidas, unidades.unidades).map((u) => u.id) : null,
  });
  if ("error" in cargado) return new NextResponse(cargado.error, { status: 500 });
  const { eerr } = eerrDelPeriodo(cargado.filas, cargado.conDatos, req.nextUrl.searchParams.get("periodo") ?? undefined, inicioDeMes(hoy));

  const titulo = ["Estado de resultados", vista.entidad?.razon_social, unidad?.nombre ?? "Todas las tiendas", vista.moneda].filter(Boolean).join(" · ");
  // Con fórmulas: secciones, resultados y totales se recalculan en Excel (mejora 93).
  const hoja = hojaPlanilla({ nombreHoja: "EERR", titulo, columnas: eerr.meses.map(mesCorto), filas: planillaEerr(filasEstado(eerr), eerr.meses) });
  const buffer = escribirLibro([{ nombre: "EERR", hoja }]);
  const nombre = `EERR-${[vista.entidad?.codigo, unidad?.nombre ?? "todas", vista.local ? vista.moneda : null].filter(Boolean).join("-").replace(/[^\w.-]+/g, "_")}-${hoy}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
