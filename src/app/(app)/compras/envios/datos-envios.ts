import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { getUsuarioActual } from "@/lib/auth";
import { incumple, resumenReal, type EnvioReal } from "@/lib/compras/rutas-envio";
import type { FilaRuta, TarifaRuta } from "./def-envios";

/** Hoy en Panamá (AAAA-MM-DD), para los últimos 12 meses y el año en curso. */
const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/**
 * Las rutas de envío con sus tarifas y lo que de verdad tardaron: las compras de ese agente, a ese país, por esa sola vía, con
 * fecha de envío y de llegada. Quien tiene países limitados ve solo las rutas de sus países. `error` si falta la migración 0092.
 */
export async function cargarRutas(): Promise<{ rutas: FilaRuta[]; agentes: string[]; tipos: string[]; error?: boolean }> {
  const supabase = createServiceClient();
  const permitidos = (await getUsuarioActual())?.paisesPermitidos ?? null;
  const [rutas, tarifas, compras] = await Promise.all([
    supabase.from("wms_rutas_envio").select("*").order("pais_nombre").order("via").order("agente"),
    supabase.from("wms_rutas_envio_tarifas").select("id, ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por, creado_en").order("vigente_desde", { ascending: false }).order("creado_en", { ascending: false }),
    traerTodasLasFilas<{ agente_envio: string; tipo: string; via_envio: string[] | null; fecha_envio: string; fecha_llegada: string; paises: { codigo: string } | { codigo: string }[] | null }>((desde, hasta) =>
      supabase
        .from("wms_compras")
        .select("agente_envio, tipo, via_envio, fecha_envio, fecha_llegada, paises(codigo)")
        .not("agente_envio", "is", null)
        .not("fecha_envio", "is", null)
        .not("fecha_llegada", "is", null)
        .order("id")
        .range(desde, hasta),
    ).catch(() => null),
  ]);
  if (rutas.error || tarifas.error || compras === null) return { rutas: [], agentes: [], tipos: [], error: true };

  // Lo real, por agente + país + vía (una compra que viajó por dos vías no dice cuánto tarda cada una).
  const envios = new Map<string, EnvioReal[]>();
  for (const c of compras) {
    if (c.tipo !== "pais" || (c.via_envio ?? []).length !== 1) continue;
    const pais = (Array.isArray(c.paises) ? c.paises[0] : c.paises)?.codigo;
    if (!pais) continue;
    const clave = `${c.agente_envio.toLowerCase()}|${pais}|${c.via_envio![0]}`;
    envios.set(clave, [...(envios.get(clave) ?? []), { llegada: c.fecha_llegada, dias: Math.round((Date.parse(c.fecha_llegada) - Date.parse(c.fecha_envio)) / 864e5) }]);
  }

  const porRuta = new Map<string, TarifaRuta[]>();
  for (const t of tarifas.data ?? []) {
    porRuta.set(t.ruta_id as string, [
      ...(porRuta.get(t.ruta_id as string) ?? []),
      { id: t.id as string, tipo: t.tipo_producto as string, precio: Number(t.precio), unidad: t.unidad as string, vigenteDesde: t.vigente_desde as string, creadoPor: (t.creado_por as string | null) ?? null },
    ]);
  }

  const hoy = hoyPanama();
  const filas: FilaRuta[] = (rutas.data ?? [])
    .filter((r) => permitidos === null || permitidos.includes(r.pais_codigo as string))
    .map((r) => {
      const suyos = r.agente ? (envios.get(`${String(r.agente).toLowerCase()}|${r.pais_codigo}|${r.via}`) ?? []) : [];
      const real = resumenReal(suyos, hoy);
      const diasMax = (r.dias_max as number | null) ?? null;
      return {
        id: r.id as string,
        agente: (r.agente as string | null) ?? null,
        paisCodigo: r.pais_codigo as string,
        paisNombre: r.pais_nombre as string,
        via: r.via as string,
        modalidad: (r.modalidad as string | null) ?? null,
        courier: (r.courier as string | null) ?? null,
        diasMin: (r.dias_min as number | null) ?? null,
        diasMax,
        activo: r.activo === true,
        nota: (r.nota as string | null) ?? null,
        url: (r.url as string | null) ?? null,
        tarifas: porRuta.get(r.id as string) ?? [],
        real,
        envios: suyos,
        incumple: incumple(diasMax, real),
      };
    });

  const agentes = [...new Set(["Chin", "Avery", ...filas.flatMap((r) => (r.agente ? [r.agente] : [])), ...compras.map((c) => c.agente_envio)])].sort((a, b) => a.localeCompare(b, "es"));
  const tipos = [...new Set(["General", ...filas.flatMap((r) => r.tarifas.map((t) => t.tipo))])];
  return { rutas: filas, agentes, tipos };
}
