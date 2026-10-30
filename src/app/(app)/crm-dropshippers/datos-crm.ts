import type { SupabaseClient } from "@supabase/supabase-js";
import type { AreaCrm } from "@/lib/crm/areas";
import { conversacionesOcultas } from "@/lib/whatsapp/ocultos";
import { dondeVende } from "@/lib/whatsapp/origen-chat";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { diasEntre, type ChatDropshipper, type FilaCaso, type FilaDropshipper, type ResumenCrm } from "./def-crm";

export interface DatosCrm {
  dropshippers: FilaDropshipper[];
  casos: FilaCaso[];
  resumen: ResumenCrm;
  /** Fecha de hoy (ISO, solo día): referencia de «hace N días». */
  hoy: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function nombreMes(hoy: string): string {
  const [anio, mes] = hoy.split("-");
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

type Relacion<T> = T | T[] | null;
const uno = <T>(r: Relacion<T>): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * El chat de WhatsApp de cada dropshipper (migración 0158) en los números de las áreas que ve la persona: la conversación más
 * reciente y la suma de no leídos de todas. Sin la migración (o sin áreas), ninguno.
 */
async function cargarChats(supabase: SupabaseClient, areas: AreaCrm[], soloId?: string): Promise<Map<string, ChatDropshipper>> {
  const chats = new Map<string, ChatDropshipper>();
  if (!areas.length) return chats;
  let consulta = supabase
    .from("whatsapp_conversaciones")
    .select("id, dropshipper_id, estado, no_leidos, ultimo_texto, ultimo_mensaje_en, ultimo_de")
    .not("dropshipper_id", "is", null)
    .in("area", areas);
  if (soloId) consulta = consulta.eq("dropshipper_id", soloId);
  const { data, error } = await consulta.order("ultimo_mensaje_en", { ascending: false, nullsFirst: false }).limit(2000);
  if (error) return chats;
  // Un chat que se autorizó borrar (migración 0172) ya no cuenta.
  const ocultas = await conversacionesOcultas(supabase);
  for (const c of (data ?? []).filter((x) => !ocultas.has(x.id as string))) {
    const id = c.dropshipper_id as string;
    const sinResponder = c.estado === "abierta" && (Number(c.no_leidos) > 0 || c.ultimo_de === "entrante");
    const antes = chats.get(id);
    if (antes) {
      antes.noLeidos += Number(c.no_leidos ?? 0);
      antes.sinResponder ||= sinResponder;
      continue;
    }
    chats.set(id, {
      conversacionId: c.id as string,
      noLeidos: Number(c.no_leidos ?? 0),
      ultimoTexto: (c.ultimo_texto as string | null) ?? null,
      ultimoMensajeEn: (c.ultimo_mensaje_en as string | null) ?? null,
      ultimoDe: (c.ultimo_de as ChatDropshipper["ultimoDe"]) ?? null,
      sinResponder,
    });
  }
  return chats;
}

/**
 * Lo que necesita el CRM para dibujarse: la base. Las sumas por
 * dropshipper (pedidos y ventas del mes, último pedido, casos abiertos) las hace Postgres en la vista
 * `crm_dropshippers_resumen` (migración 0062), no JavaScript. Con `soloId` trae solo ese dropshipper y sus casos (la ficha del chat
 * de la Bandeja de WhatsApp, 29 oct 2026).
 */
export async function obtenerDatosCrm(supabase: SupabaseClient, paisId: string, areasWhatsapp: AreaCrm[] = [], soloId?: string): Promise<DatosCrm> {
  const hoy = new Date().toISOString().slice(0, 10);

  const CAMPOS_DROPSHIPPER =
    "id, codigo, nombre, tienda, tiendas, ciudad, pais_origen, contacto_email, contacto_telefono, estado, nivel, fecha_ingreso, etiquetas, etapa, productos, notas, fase, responsable_id, perfiles:responsable_id(nombre), dropshipper_paises(pais_id, paises(codigo))";
  const consultaDropshippers = (conCuentas: boolean) => {
    const q = supabase
      .from("dropshippers")
      .select(
        conCuentas
          ? `${CAMPOS_DROPSHIPPER}, dropshipper_cuentas(id, id_externo, tienda_nombre, plataformas(nombre), paises(codigo))`
          : CAMPOS_DROPSHIPPER,
      );
    return (soloId ? q.eq("id", soloId) : q).order("nombre").limit(2000);
  };
  const consultaSumas = supabase.from("crm_dropshippers_resumen").select("id, pedidos_mes, ventas_mes, ultimo_pedido, casos_abiertos").eq("pais_id", paisId);
  const consultaCasos = supabase
    .from("casos_dropshipper")
    .select(
      "id, numero, titulo, tipo, prioridad, estado, numero_pedido, canal, abierto_en, primera_respuesta_en, escalado_en, dropshipper_id, dropshippers(nombre), perfiles:responsable_id(nombre)",
    )
    .eq("pais_id", paisId);

  // «Dónde vende» puesto a mano o quitado en el chat (migraciones 0193 y 0194). Sin ellas, solo lo de sus cuentas.
  const consultaVendeEn = (desde: number, hasta: number) => {
    const q = supabase.from("dropshipper_vende_en").select("dropshipper_id, oculto, crm_plataformas_venta(nombre), paises(codigo)");
    return (soloId ? q.eq("dropshipper_id", soloId) : q).order("dropshipper_id").range(desde, hasta);
  };

  const [conCuentas, { data: sumas }, { data: casosBd }, chats, vendeEnBd] = await Promise.all([
    consultaDropshippers(true),
    // Una fila por dropshipper y país: las ventas de este país no se mezclan con las de otro (otra moneda).
    soloId ? consultaSumas.eq("id", soloId) : consultaSumas,
    (soloId ? consultaCasos.eq("dropshipper_id", soloId) : consultaCasos).order("abierto_en", { ascending: false }).limit(500),
    cargarChats(supabase, areasWhatsapp, soloId),
    traerTodasConError<Record<string, unknown>>(consultaVendeEn),
  ]);
  const vendeEnManual = new Map<string, { plataforma: string; pais: string; oculto: boolean }[]>();
  for (const m of vendeEnBd.data ?? []) {
    const plataforma = uno<{ nombre: string }>(m.crm_plataformas_venta as Relacion<{ nombre: string }>)?.nombre;
    const pais = uno<{ codigo: string }>(m.paises as Relacion<{ codigo: string }>)?.codigo;
    if (!plataforma || !pais) continue;
    const id = m.dropshipper_id as string;
    vendeEnManual.set(id, [...(vendeEnManual.get(id) ?? []), { plataforma, pais, oculto: !!m.oculto }]);
  }

  // Plan B: si la migración 0065 (cuentas vinculadas) todavía no se corrió, el directorio se lee sin ellas.
  const filas = (conCuentas.error ? (await consultaDropshippers(false)).data : conCuentas.data) as unknown as
    | (Record<string, any>)[] // eslint-disable-line @typescript-eslint/no-explicit-any
    | null;

  const sumaPorId = new Map((sumas ?? []).map((s) => [s.id as string, s]));
  // Se listan todos los dropshippers, venda donde venda: «Vende en» filtra por país. Las cifras del mes son del país elegido.
  const dropshippers: FilaDropshipper[] = (filas ?? []).map((d) => {
    const s = sumaPorId.get(d.id);
    const paises = ((d.dropshipper_paises ?? []) as { paises: Relacion<{ codigo: string }> }[])
      .map((p) => uno<{ codigo: string }>(p.paises)?.codigo)
      .filter((c): c is string => !!c)
      .sort();
    return {
      id: d.id,
      codigo: d.codigo ?? "—",
      nombre: d.nombre,
      tiendas: d.tiendas?.length ? d.tiendas : d.tienda ? [d.tienda] : [],
      ciudad: d.ciudad,
      email: d.contacto_email,
      tieneTelefono: !!d.contacto_telefono,
      estado: d.estado,
      nivel: d.nivel,
      responsable: uno<{ nombre: string | null }>(d.perfiles as Relacion<{ nombre: string | null }>)?.nombre ?? null,
      paisOrigen: d.pais_origen,
      paises,
      ingreso: d.fecha_ingreso,
      pedidosMes: Number(s?.pedidos_mes ?? 0),
      ventasMes: Number(s?.ventas_mes ?? 0),
      ultimoPedido: s?.ultimo_pedido ?? null,
      casosAbiertos: Number(s?.casos_abiertos ?? 0),
      etiquetas: d.etiquetas ?? [],
      cuentas: ((d.dropshipper_cuentas ?? []) as unknown as {
        id: string;
        id_externo: string;
        tienda_nombre: string | null;
        plataformas: Relacion<{ nombre: string }>;
        paises: Relacion<{ codigo: string }>;
      }[]).map((c) => ({
        id: c.id,
        plataforma: uno<{ nombre: string }>(c.plataformas)?.nombre ?? "—",
        codigoPais: uno<{ codigo: string }>(c.paises)?.codigo ?? "—",
        idExterno: c.id_externo,
        tienda: c.tienda_nombre,
      })),
      fase: d.fase ?? "activo",
      responsableId: d.responsable_id ?? null,
      etapa: d.etapa ?? null,
      productos: d.productos ?? [],
      plataformas: [],
      vendeEn: [],
      notas: d.notas,
      // La serie de seis meses de la ficha se pide al abrirla cuando haya pedidos reales (fase siguiente).
      pedidosPorMes: [],
      whatsapp: chats.get(d.id) ?? null,
    };
  });

  for (const d of dropshippers) {
    d.plataformas = [...new Set(d.cuentas.map((c) => c.plataforma))];
    d.vendeEn = dondeVende(
      d.cuentas.map((c) => ({ plataforma: c.plataforma === "—" ? null : c.plataforma, pais: c.codigoPais === "—" ? null : c.codigoPais })),
      vendeEnManual.get(d.id) ?? [],
    );
  }

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
    escalado: !!c.escalado_en,
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

  return { dropshippers, casos, resumen, hoy };
}
