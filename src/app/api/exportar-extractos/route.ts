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
  if (!usuario || !usuario.modulos.includes("extractos")) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const filas = await traerTodasLasFilas<{
    fecha: string;
    monto: number;
    tipo: string;
    descripcion: string | null;
    plataformas: { nombre: string } | { nombre: string }[] | null;
    extractos_bancarios: { pais_id: string } | { pais_id: string }[] | null;
  }>((rDesde, rHasta) =>
    supabase
      .from("movimientos_bancarios")
      .select("fecha, monto, tipo, descripcion, plataformas(nombre), extractos_bancarios!inner(pais_id)")
      .eq("extractos_bancarios.pais_id", pais.id)
      .order("fecha", { ascending: false })
      .range(rDesde, rHasta)
  );

  const encabezado = ["Fecha", "Monto", "Tipo", "Descripción", "Plataforma"];
  const lineas = [encabezado.join(",")];
  for (const m of filas) {
    const plataforma = Array.isArray(m.plataformas) ? m.plataformas[0] : m.plataformas;
    lineas.push(
      [
        celdaCsv(formatearFecha(m.fecha)),
        celdaCsv(Number(m.monto).toFixed(2)),
        celdaCsv(m.tipo),
        celdaCsv(m.descripcion ?? ""),
        celdaCsv(plataforma?.nombre ?? "Sin asignar"),
      ].join(",")
    );
  }

  return new NextResponse(lineas.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="extractos-${pais.codigo}.csv"`,
    },
  });
}
