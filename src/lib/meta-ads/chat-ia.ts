// Anuncios Meta › Hallazgos › chat con la IA (24 nov 2026, pedido de Alcides: «una especie de chat para preguntarle cosas a la IA… en base a todo el historial de estadísticas»). La persona pregunta («¿qué producto es el que mejor
// está funcionando?», «¿cuál es el cambio más grande entre el mes pasado y este?», «¿qué pasó este mes frente al pasado?») y la IA contesta **solo con las estadísticas que el sistema ya calculó** (las de `historico.ts`: hallazgos,
// tendencias con su motivo, entrega por producto, rankings, bandas y mes a mes). No calcula sobre la base ni inventa: si el dato no está, lo dice. Lógica pura, con prueba: el contexto, el pedido, el historial de la conversación
// y la limpieza de la respuesta. La llamada vive en `actions.ts`.

import { NOMBRE_CATEGORIA, type AnalisisHistorico, type FilaVentas } from "./historico";

export const LIMITES_CHAT = {
  /** Largo máximo de una pregunta. */
  pregunta: 600,
  /** Mensajes anteriores que se mandan junto con la pregunta (para que «¿y por qué?» se entienda). */
  mensajes: 6,
  /** Largo máximo de cada mensaje anterior. */
  mensaje: 1500,
  /** Largo máximo de una respuesta que se muestra. */
  respuesta: 3500,
  /** Preguntas por persona en 24 horas (cada una cuesta unos centavos de crédito de IA). */
  porDia: 40,
} as const;

export interface MensajeChat {
  rol: "usuario" | "ia";
  texto: string;
}

/** El historial que manda el navegador, validado: solo los últimos mensajes, con rol conocido y texto recortado. Nunca lanza. */
export function sanitizarHistorial(crudo: unknown): MensajeChat[] {
  if (!Array.isArray(crudo)) return [];
  const limpio: MensajeChat[] = [];
  for (const m of crudo) {
    if (!m || typeof m !== "object") continue;
    const { rol, texto } = m as { rol?: unknown; texto?: unknown };
    if ((rol !== "usuario" && rol !== "ia") || typeof texto !== "string") continue;
    const t = texto.replace(/\s+/g, " ").trim().slice(0, LIMITES_CHAT.mensaje);
    if (t) limpio.push({ rol, texto: t });
  }
  return limpio.slice(-LIMITES_CHAT.mensajes);
}

/** La pregunta limpia, o el error en palabras. */
export function revisarPregunta(crudo: unknown): { pregunta: string } | { error: string } {
  const p = typeof crudo === "string" ? crudo.replace(/\s+/g, " ").trim() : "";
  if (p.length < 4) return { error: "Escribe tu pregunta." };
  if (p.length > LIMITES_CHAT.pregunta) return { error: `La pregunta es muy larga (máximo ${LIMITES_CHAT.pregunta} letras).` };
  return { pregunta: p };
}

const r = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/** Todas las estadísticas, en JSON compacto: lo único que la IA puede usar para contestar. */
export function contextoDeChat(a: AnalisisHistorico, tiendas: readonly string[], hoy: string): string {
  const datos = {
    hoy,
    mes_en_curso: hoy.slice(0, 7),
    aviso_mes_en_curso: `El mes en curso (${hoy.slice(0, 7)}) va por el día ${hoy.slice(8, 10)}: está incompleto. Para compararlo con un mes completo usa promedios por día o cifras que no dependan del total (CPA, CTR, hook, CPM, CVR), no el gasto ni las compras totales.`,
    resumen: {
      campanas: a.resumen.campanas,
      videos: a.resumen.videos,
      gasto_usd: Math.round(a.resumen.gasto),
      compras: a.resumen.compras,
      desde: a.resumen.desde,
      hasta: a.resumen.hasta,
      tasa_entrega_promedio: r(a.resumen.tasaEntrega),
      campanas_medibles: a.resumen.campanasMedibles,
      porcentaje_que_funciono: r(a.resumen.tasaFuncionaron),
      tiendas_de_las_cuentas: tiendas,
    },
    como_se_calcula: "«funcionó» = al menos $100 gastados, alguna compra y CPA dentro del CPA tope del producto. Tasa de entrega = entregados ÷ (entregados + devueltos) de los pedidos de 180 días. cpa_por_compra_entregada = gasto ÷ (compras × tasa de entrega).",
    mes_a_mes_todo: a.meses,
    mes_a_mes_por_producto: a.mesesPorProducto,
    hallazgos: a.hallazgos.slice(0, 60).map((h) => ({ tipo: NOMBRE_CATEGORIA[h.categoria], tono: h.tono, titulo: h.titulo, detalle: h.detalle, motivo: h.motivo ?? null, certeza: h.certeza })),
    tendencias: a.tendencias
      .filter((t) => t.cambio.sentido !== "poca")
      .slice(0, 120)
      .map((t) => ({ nivel: t.nivel, nombre: t.nombre, ventana: t.ventana === "mes" ? "último mes contra el anterior" : "última semana contra las tres anteriores", sentido: t.cambio.sentido, gasto_reciente_usd: Math.round(t.gastoRec), compras_antes: t.comprasPrev, compras_ahora: t.comprasRec, cpa_antes: r(t.cambio.cpaPrev), cpa_ahora: r(t.cambio.cpaRec), motivo: t.cambio.motivo })),
    entrega_por_producto: a.entrega.slice(0, 40).map((f) => ({ producto: f.nombre, producto_en_la_tienda: f.enTienda, gasto_usd: Math.round(f.gasto), compras: f.compras, cpa: r(f.cpa), cpa_tope: f.tope, tasa_entrega: r(f.tasa), pedidos_resueltos: f.cerradas, entregadas: f.entregadas, devueltas: f.devueltas, canceladas: f.canceladas, cpa_por_compra_entregada: r(f.cpaEntregado), veredicto: f.veredicto })),
    mas_ventas: Object.fromEntries((Object.entries(a.rankings) as [string, FilaVentas[]][]).map(([k, filas]) => [k, filas.map((f) => ({ nombre: f.nombre, compras: f.compras, parte_del_total: r(f.parte), gasto_usd: Math.round(f.gasto), cpa: r(f.cpa), entregadas_estimadas: r(f.comprasEntregadas) }))])),
    bandas_de_metricas: a.bandas.map((b) => ({ metrica: b.titulo, porcentaje_base_que_funciono: r(b.tasaBase), bandas: b.filas.map((f) => ({ banda: f.etiqueta, campanas: f.campanas, funcionaron: f.funcionaron, cpa: r(f.cpa) })) })),
  };
  return JSON.stringify(datos);
}

/** El pedido: las reglas fijas, la conversación hasta ahora, la pregunta y todas las estadísticas. */
export function pedidoChat(a: AnalisisHistorico, tiendas: readonly string[], hoy: string, pregunta: string, historial: readonly MensajeChat[]): { instrucciones: string; texto: string } {
  const instrucciones = [
    "Eres analista de rendimiento de anuncios de Meta (Facebook e Instagram) de una operación de comercio electrónico con pago contra entrega en Panamá y Costa Rica. Contestas preguntas de quien monta las campañas, que no es analista.",
    "Respondes SOLO con las estadísticas del sistema que recibes en el JSON. No tienes acceso a nada más: no inventes cifras, productos, fechas ni causas. Si el dato que piden no está en el JSON, dilo claramente («eso no está en las estadísticas») y di qué sí hay.",
    "Puedes comparar, restar, calcular porcentajes y ordenar con las cifras del JSON; cuando calcules algo, muestra de qué cifras sale. Para comparar meses usa `mes_a_mes_todo` y `mes_a_mes_por_producto`; para saber qué empeoró y por qué, `tendencias` (el motivo viene ya calculado); para entrega, `entrega_por_producto`.",
    "El mes en curso está incompleto: no lo compares con un mes entero por totales (gasto, compras); usa CPA, CTR, hook, CPM, CVR o promedios por día, y avisa que está incompleto.",
    "Distingue lo comprobado (mucho gasto, certeza firme) de lo que apenas empieza a verse (poca data). Una correlación no es una causa: «se asocia con», no «causa».",
    "Contesta directo y en español claro: primero la respuesta, luego las cifras que la respaldan y, si ayuda, qué hacer. Frases cortas, sin jerga, máximo unas 250 palabras. Usa guiones para listas; no uses tablas ni formato Markdown (sin asteriscos ni almohadillas).",
    "Si la pregunta no tiene que ver con el rendimiento de las campañas, los productos, la entrega o el historial, di amablemente que solo puedes ayudar con eso.",
  ].join("\n");
  const conversacion = historial.length ? `Conversación hasta ahora:\n${historial.map((m) => `${m.rol === "usuario" ? "Pregunta" : "Respuesta"}: ${m.texto}`).join("\n")}\n\n` : "";
  return { instrucciones, texto: `${conversacion}Pregunta nueva: ${pregunta}\n\nEstadísticas del sistema (JSON):\n${contextoDeChat(a, tiendas, hoy)}` };
}

/** La respuesta lista para mostrar: sin formato Markdown que sobre, sin espacios de más y con tope de largo. */
export function limpiarRespuesta(texto: string | null | undefined): string {
  return (texto ?? "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[*•][ \t]+/gm, "- ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LIMITES_CHAT.respuesta);
}
