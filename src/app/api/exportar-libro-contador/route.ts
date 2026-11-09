import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { leerPeriodo, mesLargo } from "@/lib/af4/fecha";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { libroContador, type MovimientoContador, type VentaContador } from "@/lib/finanzas/libro-contador";
import { SIN_TIENDA } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface FilaMov {
  periodo: string;
  fecha_pago: string | null;
  fecha_registro: string | null;
  fecha_servicio: string | null;
  ruc_proveedor: string | null;
  unidad_a_pagar: string | null;
  descripcion: string | null;
  factura_numero: string | null;
  factura: string | null;
  monto: number | string;
  itbms?: number | string | null;
  tipo_texto: string | null;
  fin_tipos: Uno<{ nombre: string; seccion: string }>;
  fin_cuentas: Uno<{ nombre: string }>;
  fin_unidades: Uno<{ nombre: string }>;
}

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
  const [a, m] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const permitidas = await cargarTiendasPermitidas();
  const lista = permitidas ? (permitidas.length ? permitidas : [SIN_TIENDA]) : null;
  const supabase = createServiceClient();
  const columnas =
    "periodo, fecha_pago, fecha_registro, fecha_servicio, ruc_proveedor, unidad_a_pagar, descripcion, factura_numero, factura, monto, tipo_texto, fin_tipos(nombre, seccion), fin_cuentas(nombre), fin_unidades(nombre)";
  const leer = (cols: string) =>
    traerTodasConError<FilaMov>((d, h) => {
      let q = supabase.from("fin_movimientos").select(cols).eq("periodo", mes).order("id").range(d, h);
      if (lista) q = q.in("unidad_id", lista);
      return q as unknown as PromiseLike<{ data: FilaMov[] | null; error: unknown }>;
    });
  // Con la migración 0937 trae el ITBMS; sin ella, sin esa columna.
  let movs = await leer(`${columnas}, itbms`);
  if (movs.error) movs = await leer(columnas);
  if (movs.error) return new NextResponse("Falta la migración 0901.", { status: 500 });
  const ventas = await traerTodasConError<{ fecha: string; numero: string; factura_numero: string | null; total: number | string; fin_unidades: Uno<{ nombre: string }> }>((d, h) => {
    let q = supabase.from("ven_ordenes").select("fecha, numero, factura_numero, total, fin_unidades(nombre)").eq("facturado", true).gte("fecha", mes).lte("fecha", fin).order("id").range(d, h);
    if (lista) q = q.in("unidad_id", lista);
    return q as unknown as PromiseLike<{ data: { fecha: string; numero: string; factura_numero: string | null; total: number | string; fin_unidades: Uno<{ nombre: string }> }[] | null; error: unknown }>;
  });

  const movimientos: MovimientoContador[] = (movs.data ?? []).map((f) => {
    const tipo = uno(f.fin_tipos);
    const itbms = f.itbms === null || f.itbms === undefined ? null : Number(f.itbms);
    return {
      fecha: String(f.fecha_servicio ?? f.fecha_registro ?? f.fecha_pago ?? f.periodo).slice(0, 10),
      ruc: f.ruc_proveedor,
      proveedor: f.unidad_a_pagar ?? f.descripcion,
      documento: f.factura_numero ?? f.factura,
      total: Number(f.monto),
      itbms,
      tipo: tipo?.nombre ?? f.tipo_texto ?? "Sin tipo",
      seccion: tipo?.seccion ?? "sin_clasificar",
      cuenta: uno(f.fin_cuentas)?.nombre ?? null,
      tienda: uno(f.fin_unidades)?.nombre ?? null,
    };
  });
  const filasVentas: VentaContador[] = ventas.error
    ? []
    : (ventas.data ?? []).map((v) => ({ fecha: String(v.fecha).slice(0, 10), documento: v.factura_numero, orden: v.numero, tienda: uno(v.fin_unidades)?.nombre ?? "—", total: Number(v.total) }));

  const buffer = libroContador(movimientos, filasVentas, mesLargo(mes));
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Libro-contador-${mes.slice(0, 7)}.xlsx"`,
    },
  });
}
