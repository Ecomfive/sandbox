import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { cargarCiudad, rangoDespacho } from "@/lib/despacho/datos";
import { COLUMNAS_HOJA, filaExcel, gruposHoja } from "@/lib/despacho/hoja";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * La hoja del día en Excel (`?dia=AAAA-MM-DD`, opcional `&repartidor=`): una hoja por repartidor con las columnas de Monday y sus totales. Solo para
 * quien tiene Despacho ciudad.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("despacho-ciudad")) return new NextResponse("No autorizado", { status: 403 });
  const { hoy } = rangoDespacho(1);
  const pedido = req.nextUrl.searchParams.get("dia") ?? "";
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : hoy;
  const repartidor = req.nextUrl.searchParams.get("repartidor");
  const { filas, faltaMigracion } = await cargarCiudad(createServiceClient(), dia, dia);
  if (faltaMigracion) return new NextResponse("Falta la migración 0970.", { status: 500 });
  const grupos = gruposHoja(filas).filter((g) => !repartidor || g.nombre === repartidor);

  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const g of grupos.length ? grupos : [{ nombre: "Sin pedidos", filas: [], sumas: { pedidos: 0, entregados: 0, porCobrar: 0, cobrado: 0, costeEnvio: 0 } }]) {
    const total = ["Total", null, null, null, `${g.sumas.entregados} de ${g.sumas.pedidos} entregados`, null, null, g.sumas.porCobrar, g.sumas.cobrado, null, null, g.sumas.costeEnvio, null];
    const ws = XLSX.utils.aoa_to_sheet([[`Hoja del día · ${g.nombre} · ${dia.split("-").reverse().join("/")}`], [], [...COLUMNAS_HOJA], ...g.filas.map(filaExcel), total]);
    ws["!cols"] = [10, 10, 14, 18, 13, 11, 15, 12, 12, 12, 40, 11, 18].map((wch) => ({ wch }));
    // El nombre de la hoja: hasta 31 caracteres, sin los que Excel no acepta, y sin repetir.
    let nombre = g.nombre.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    for (let i = 2; usados.has(nombre); i++) nombre = `${g.nombre.slice(0, 27)} (${i})`;
    usados.add(nombre);
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hoja-del-dia-${dia}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
