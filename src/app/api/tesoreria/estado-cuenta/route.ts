import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { cargarPrestamosGrupo } from "@/lib/finanzas/cargar-prestamos-grupo";
import { estadoDeCuenta, etiquetaTipoGrupo } from "@/lib/finanzas/prestamos-grupo";
import { hoyPanama } from "@/lib/af4/fecha";
import { celdaCsv } from "@/lib/tabla/csv";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** Estado de cuenta de un par del grupo (mejora 61): cada movimiento de las dos direcciones con el saldo neto, en CSV. */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("tesoreria") || (await sinAccesoTodaLaEmpresa())) return new NextResponse("No autorizado", { status: 403 });
  const a = req.nextUrl.searchParams.get("a") ?? "";
  const b = req.nextUrl.searchParams.get("b") ?? "";
  if (!UUID.test(a) || !UUID.test(b) || a === b) return new NextResponse("Par inválido", { status: 400 });
  const supabase = createServiceClient();
  const datos = await cargarPrestamosGrupo(supabase);
  if (!datos) return new NextResponse("Falta la migración 0983", { status: 500 });
  const nombre = new Map(datos.partes.map((p) => [p.id, p.nombre]));
  if (!nombre.has(a) || !nombre.has(b)) return new NextResponse("No existe", { status: 404 });
  const na = nombre.get(a)!;
  const nb = nombre.get(b)!;
  const lineas = estadoDeCuenta(datos.movs, a, b);
  const enc = ["Fecha", "Tipo", "Presta", "Debe", "Concepto", "Órdenes", `Aumenta lo que ${nb} debe a ${na}`, `Saldo: ${nb} debe a ${na}`];
  const csv = [
    `Estado de cuenta entre ${na} y ${nb} al ${hoyPanama()} (USD; saldo negativo = ${na} le debe a ${nb})`,
    enc.map(celdaCsv).join(","),
    ...lineas.map((l) =>
      [l.fecha, etiquetaTipoGrupo(l.tipo), nombre.get(l.acreedorId), nombre.get(l.deudorId), l.concepto, l.ordenes.join(" "), l.efecto, l.saldo].map(celdaCsv).join(","),
    ),
  ].join("\r\n");
  await registrarAuditoria({ accion: "estado_cuenta_grupo", entidad: "fin_grupo_movimientos", detalle: `Descargó el estado de cuenta entre ${na} y ${nb}` });
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="estado-de-cuenta-${slug(na)}-${slug(nb)}-${hoyPanama()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
