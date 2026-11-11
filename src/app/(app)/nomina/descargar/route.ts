import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { mesCorto } from "@/lib/af4/fecha";
import { cargarLineas, cargarMeses, cargarUnidades, type LineaMes } from "@/lib/nomina/cargar";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * La planilla de un mes en Excel (`?mes=AAAA-MM-01`): una hoja para la planilla formal y otra para la externa, con sus
 * totales. Datos sensibles: solo para quien tiene el módulo Nómina, y los documentos van enmascarados (el completo se ve
 * en la ficha de la persona).
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("nomina")) return new NextResponse("No autorizado", { status: 403 });
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(mes)) return new NextResponse("Mes inválido", { status: 400 });

  const supabase = createServiceClient();
  const [unidades, meses] = await Promise.all([cargarUnidades(supabase), cargarMeses(supabase)]);
  if ("error" in unidades || "error" in meses) return new NextResponse("Falta la migración 0906.", { status: 500 });
  const cargadas = await cargarLineas(supabase, [mes], unidades.nombre);
  if ("error" in cargadas) return new NextResponse(cargadas.error, { status: 500 });
  const orden = (a: LineaMes, b: LineaMes) => a.tramo.localeCompare(b.tramo) || a.nombre.localeCompare(b.nombre);
  const formal = cargadas.lineas.filter((l) => l.tipo === "formal").sort(orden);
  const externa = cargadas.lineas.filter((l) => l.tipo === "externa").sort(orden);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const suma = (ls: LineaMes[], f: (l: LineaMes) => number) => r2(ls.reduce((a, l) => a + f(l), 0));

  const wb = XLSX.utils.book_new();
  const hoja = (nombre: string, titulo: string, encabezado: string[], filas: (string | number | null)[][], anchos: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet([[titulo], [], encabezado, ...filas]);
    ws["!cols"] = anchos.map((wch) => ({ wch }));
    const rango = XLSX.utils.decode_range(ws["!ref"]!);
    for (let r = 3; r <= rango.e.r; r++) {
      for (let c = 0; c <= rango.e.c; c++) {
        const celda = ws[XLSX.utils.encode_cell({ r, c })];
        if (celda && typeof celda.v === "number") celda.z = "#,##0.00";
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };

  hoja(
    "Planilla formal",
    `Planilla formal · ${mesCorto(mes)} · USD`,
    ["Pago", "Persona", "Documento", "Cargo", "Tienda", "Salario mensual", "Devengado", "Horas extra", "Feriados", "Bono", "Descuentos", "Total asignaciones", "Seguro Social 9,75 %", "Seguro Educativo 1,25 %", "Salario neto", "Observación"],
    [
      ...formal.map((l) => [l.tramo, l.nombre, l.documento, l.cargo, l.unidad, l.salarioMensual, l.devengado, l.montoHorasExtra, l.montoFeriado, l.bono, l.descuentos, l.bruto, l.seguroSocial, l.seguroEducativo, l.neto, l.observacion]),
      [
        "Total", null, null, null, null, null,
        suma(formal, (l) => l.devengado), suma(formal, (l) => l.montoHorasExtra), suma(formal, (l) => l.montoFeriado), suma(formal, (l) => l.bono),
        suma(formal, (l) => l.descuentos), suma(formal, (l) => l.bruto), suma(formal, (l) => l.seguroSocial), suma(formal, (l) => l.seguroEducativo),
        suma(formal, (l) => l.neto), null,
      ],
    ],
    [14, 30, 14, 26, 16, 12, 12, 12, 10, 10, 12, 14, 14, 14, 14, 40],
  );

  const comision = r2(meses.comision[mes] ?? 0);
  hoja(
    "Externa USDT",
    `Nómina externa · ${mesCorto(mes)} · USDT`,
    ["Pago", "Persona", "Rol", "Tienda", "Sueldo", "Horas extra", "Bono", "Total USDT", "Pagado", "Fecha de pago", "Medio de pago", "Observación"],
    [
      ...externa.map((l) => [l.tramo, l.nombre, l.cargo, l.unidad, l.devengado, l.montoHorasExtra, l.bono, l.neto, l.pagado === true ? "SI" : l.pagado === false ? "NO" : null, l.fechaPago, l.medioPago, l.observacion]),
      ["Total pagado", null, null, null, suma(externa, (l) => l.devengado), suma(externa, (l) => l.montoHorasExtra), suma(externa, (l) => l.bono), suma(externa, (l) => l.neto)],
      ["Comisión P2P / Binance", null, null, null, null, null, null, comision],
      ["Total con comisión", null, null, null, null, null, null, r2(suma(externa, (l) => l.neto) + comision)],
    ],
    [16, 30, 26, 16, 12, 12, 10, 14, 8, 14, 16, 40],
  );

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nomina-${mes.slice(0, 7)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
