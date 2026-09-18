import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getUsuarioActual } from "@/lib/auth";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

function celdaCsv(valor: string | number): string {
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function GET(request: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("pedidos-dropi")) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const hoy = new Date().toISOString().slice(0, 10);
  const haceNDias = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const desde = searchParams.get("desde") || haceNDias(6);
  const hasta = searchParams.get("hasta") || hoy;

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: plataformaDropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  const plataformaId = plataformaDropi?.id ?? "";

  const filas = await traerTodasLasFilas<{
    referencia_externa: string;
    fecha: string;
    fecha_hora: string | null;
    cantidad: number;
    monto: number;
    estado: string;
    productos: { sku: string; nombre: string } | { sku: string; nombre: string }[] | null;
  }>((rDesde, rHasta) =>
    supabase
      .from("ordenes")
      .select("referencia_externa, fecha, fecha_hora, cantidad, monto, estado, productos(sku, nombre)")
      .eq("pais_id", pais.id)
      .eq("plataforma_id", plataformaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .range(rDesde, rHasta)
  );

  const encabezado = ["Orden", "Fecha", "Fecha y hora", "SKU", "Producto", "Cantidad", "Monto", "Estado"];
  const lineas = [encabezado.join(",")];
  for (const o of filas) {
    const producto = Array.isArray(o.productos) ? o.productos[0] : o.productos;
    lineas.push(
      [
        celdaCsv(o.referencia_externa),
        celdaCsv(o.fecha),
        celdaCsv(o.fecha_hora ?? ""),
        celdaCsv(producto?.sku ?? ""),
        celdaCsv(producto?.nombre ?? ""),
        celdaCsv(o.cantidad),
        celdaCsv(Number(o.monto).toFixed(2)),
        celdaCsv(o.estado),
      ].join(",")
    );
  }

  return new NextResponse(lineas.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-dropi-${pais.codigo}-${desde}_a_${hasta}.csv"`,
    },
  });
}
