// Lectura del libro del contador de un mes (mejora 94): compras y gastos del libro de movimientos con su ITBMS (si se
// cargó, migración 0937) y las ventas facturadas de Ventas por tienda. La usan la descarga /api/exportar-libro-contador
// y la liquidación de ITBMS del Calendario fiscal. Recibe el cliente de servicio; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { MovimientoContador, VentaContador } from "./libro-contador";

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

/** `mes` = AAAA-MM-01. `lista` = las tiendas que se leen (null = todas). */
export async function cargarLibroContador(
  supabase: SupabaseClient,
  mes: string,
  lista: string[] | null,
): Promise<{ error: string } | { movimientos: MovimientoContador[]; ventas: VentaContador[] }> {
  const [a, m] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
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
  if (movs.error) return { error: "Falta la migración 0901." };
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

  return { movimientos, ventas: filasVentas };
}
