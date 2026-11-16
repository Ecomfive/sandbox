import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { leerPeriodo, mesLargo } from "@/lib/af4/fecha";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { libroContador } from "@/lib/finanzas/libro-contador";
import { cargarLibroContador } from "@/lib/finanzas/cargar-libro-contador";
import { SIN_TIENDA } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * El libro del período para el contador externo (mejora 94): `?periodo=AAAA-MM`. Compras y gastos del libro de
 * movimientos y ventas facturadas, con totales por tipo. Pide el Libro de movimientos; con tiendas limitadas, solo las
 * suyas.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("libro-movimientos")) return new NextResponse("No autorizado", { status: 403 });
  const mes = leerPeriodo(req.nextUrl.searchParams.get("periodo") ?? undefined);
  if (!mes) return new NextResponse("Período inválido.", { status: 400 });
  const permitidas = await cargarTiendasPermitidas();
  const lista = permitidas ? (permitidas.length ? permitidas : [SIN_TIENDA]) : null;
  const datos = await cargarLibroContador(createServiceClient(), mes, lista);
  if ("error" in datos) return new NextResponse(datos.error, { status: 500 });
  const buffer = libroContador(datos.movimientos, datos.ventas, mesLargo(mes));
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Libro-contador-${mes.slice(0, 7)}.xlsx"`,
    },
  });
}
