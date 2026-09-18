import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getUsuarioActual } from "@/lib/auth";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { formatearFecha } from "@/lib/formato";

function celdaCsv(valor: string | number): string {
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("alertas")) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const filas = await traerTodasLasFilas<{
    cantidad: number;
    fecha_deteccion: string;
    fecha_reclamo: string | null;
    estado: string;
    productos: { sku: string; nombre: string } | { sku: string; nombre: string }[] | null;
  }>((rDesde, rHasta) =>
    supabase
      .from("alertas_inventario_no_retornado")
      .select("cantidad, fecha_deteccion, fecha_reclamo, estado, productos(sku, nombre)")
      .eq("pais_id", pais.id)
      .order("fecha_deteccion", { ascending: false })
      .range(rDesde, rHasta)
  );

  const encabezado = ["SKU", "Producto", "Cantidad", "Detectada", "Reclamada", "Estado"];
  const lineas = [encabezado.join(",")];
  for (const a of filas) {
    const producto = Array.isArray(a.productos) ? a.productos[0] : a.productos;
    lineas.push(
      [
        celdaCsv(producto?.sku ?? ""),
        celdaCsv(producto?.nombre ?? ""),
        celdaCsv(a.cantidad),
        celdaCsv(formatearFecha(a.fecha_deteccion)),
        celdaCsv(a.fecha_reclamo ? formatearFecha(a.fecha_reclamo) : ""),
        celdaCsv(a.estado),
      ].join(",")
    );
  }

  return new NextResponse(lineas.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alertas-${pais.codigo}.csv"`,
    },
  });
}
