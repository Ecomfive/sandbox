import type { SupabaseClient } from "@supabase/supabase-js";
import { CASOS_DEMO, DROPSHIPPERS_DEMO, MODO_DEMO, resumenDemo } from "./datos-demo";
import { diasEntre, type FilaCaso, type FilaDropshipper, type ResumenCrm } from "./def-crm";

export interface DatosCrm {
  dropshippers: FilaDropshipper[];
  casos: FilaCaso[];
  resumen: ResumenCrm;
  /** Fecha de hoy (ISO, solo día): referencia de «hace N días». */
  hoy: string;
  demo: boolean;
}

const COLONES_POR_DOLAR = 520;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function nombreMes(hoy: string): string {
  const [anio, mes] = hoy.split("-");
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

type Relacion<T> = T | T[] | null;
const uno = <T>(r: Relacion<T>): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * Lo que necesita el CRM para dibujarse: con `MODO_DEMO` los datos de ejemplo; si no, la base. Las sumas por
 * dropshipper (pedidos y ventas del mes, último pedido, casos abiertos) las hace Postgres en la vista
 * `crm_dropshippers_resumen` (migración 0062), no JavaScript.
 */
export async function obtenerDatosCrm(supabase: SupabaseClient, paisId: string, codigoPais: string): Promise<DatosCrm> {
  const hoy = new Date().toISOString().slice(0, 10);

  if (MODO_DEMO) {
    // Los montos de ejemplo están en colones; en Panamá (dólares) se dividen para que no parezcan millones de dólares.
    const k = codigoPais === "CR" ? 1 : COLONES_POR_DOLAR;
    const resumen = resumenDemo(nombreMes(hoy));
    return {
      dropshippers: DROPSHIPPERS_DEMO.map((d) => ({ ...d, ventasMes: Math.round(d.ventasMes / k) })),
      casos: CASOS_DEMO,
      resumen: { ...resumen, ventasMes: Math.round(resumen.ventasMes / k) },
      hoy,
      demo: true,
    };
  }

  const [{ data: filas }, { data: sumas }, { data: casosBd }] = await Promise.all([
    supabase
      .from("dropshippers")
      .select(
        "id, codigo, nombre, tienda, ciudad, contacto_email, contacto_telefono, estado, nivel, fecha_ingreso, etiquetas, notas, perfiles:responsable_id(nombre)",
      )
      .eq("pais_id", paisId)
      .order("nombre"),
    supabase.from("crm_dropshippers_resumen").select("id, pedidos_mes, ventas_mes, ultimo_pedido, casos_abiertos"),
    supabase
      .from("casos_dropshipper")
      .select(
        "id, numero, titulo, tipo, prioridad, estado, numero_pedido, canal, abierto_en, primera_respuesta_en, dropshipper_id, dropshippers!inner(nombre, pais_id), perfiles:responsable_id(nombre)",
      )
      .eq("dropshippers.pais_id", paisId)
      .order("abierto_en", { ascending: false })
      .limit(500),
  ]);

  const sumaPorId = new Map((sumas ?? []).map((s) => [s.id as string, s]));
  const dropshippers: FilaDropshipper[] = (filas ?? []).map((d) => {
    const s = sumaPorId.get(d.id);
    return {
      id: d.id,
      codigo: d.codigo ?? "—",
      nombre: d.nombre,
      tienda: d.tienda,
      ciudad: d.ciudad,
      email: d.contacto_email,
      telefono: d.contacto_telefono,
      estado: d.estado,
      nivel: d.nivel,
      responsable: uno<{ nombre: string | null }>(d.perfiles as Relacion<{ nombre: string | null }>)?.nombre ?? null,
      ingreso: d.fecha_ingreso,
      pedidosMes: Number(s?.pedidos_mes ?? 0),
      ventasMes: Number(s?.ventas_mes ?? 0),
      ultimoPedido: s?.ultimo_pedido ?? null,
      casosAbiertos: Number(s?.casos_abiertos ?? 0),
      etiquetas: d.etiquetas ?? [],
      notas: d.notas,
      // La serie de seis meses de la ficha se pide al abrirla cuando haya pedidos reales (fase siguiente).
      pedidosPorMes: [],
    };
  });

  const ahora = Date.now();
  const casos: FilaCaso[] = (casosBd ?? []).map((c) => ({
    id: c.id,
    codigo: `CAS-${String(c.numero).padStart(4, "0")}`,
    titulo: c.titulo,
    dropshipperId: c.dropshipper_id,
    dropshipper: uno<{ nombre: string }>(c.dropshippers as Relacion<{ nombre: string }>)?.nombre ?? "",
    tipo: c.tipo,
    prioridad: c.prioridad,
    estado: c.estado,
    numeroPedido: c.numero_pedido,
    responsable: uno<{ nombre: string | null }>(c.perfiles as Relacion<{ nombre: string | null }>)?.nombre ?? null,
    canal: c.canal,
    horasAbierto: Math.max(0, Math.round((ahora - Date.parse(c.abierto_en)) / 3_600_000)),
  }));

  const abiertos = casosBd?.filter((c) => c.estado !== "resuelto") ?? [];
  const respuestas = (casosBd ?? [])
    .filter((c) => c.primera_respuesta_en)
    .map((c) => (Date.parse(c.primera_respuesta_en) - Date.parse(c.abierto_en)) / 60_000);

  const resumen: ResumenCrm = {
    activos: dropshippers.filter((d) => d.estado === "activo").length,
    activosDeltaMes: null,
    totalDropshippers: dropshippers.length,
    pedidosMes: dropshippers.reduce((t, d) => t + d.pedidosMes, 0),
    pedidosDeltaPct: null,
    ventasMes: dropshippers.reduce((t, d) => t + d.ventasMes, 0),
    ventasDeltaPct: null,
    casosAbiertos: abiertos.length,
    casosSinResponder: abiertos.filter((c) => !c.primera_respuesta_en && ahora - Date.parse(c.abierto_en) > 24 * 3_600_000).length,
    primeraRespuestaMin: respuestas.length ? Math.round(respuestas.reduce((t, m) => t + m, 0) / respuestas.length) : null,
    primeraRespuestaDeltaMin: null,
    sinPedir30: dropshippers.filter((d) => d.estado === "activo" && d.ultimoPedido && diasEntre(d.ultimoPedido, hoy) >= 30).length,
    mes: nombreMes(hoy),
  };

  return { dropshippers, casos, resumen, hoy, demo: false };
}
