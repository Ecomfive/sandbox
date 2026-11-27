// Anuncios Meta › Hallazgos › chat con la IA (24 nov 2026, pedido de Alcides: «una especie de chat para preguntarle cosas a la IA… en base a todo el historial de estadísticas»). La persona pregunta («¿qué producto es el que mejor
// está funcionando?», «¿cuál es el cambio más grande entre el mes pasado y este?», «¿qué pasó este mes frente al pasado?») y la IA contesta **solo con las estadísticas que el sistema ya calculó** (las de `historico.ts`: hallazgos,
// tendencias con su motivo, entrega por producto, rankings, bandas y mes a mes). No calcula sobre la base ni inventa: si el dato no está, lo dice. Lógica pura, con prueba: el contexto, el pedido, el historial de la conversación
// y la limpieza de la respuesta. La llamada vive en `actions.ts`.

import { cualesParaIA } from "./angulo-detalle";
import { CLAVES_FILTRO, DIMENSIONES, METRICAS } from "./analisis-pedido";
import { NOMBRE_CATEGORIA, type AnalisisHistorico, type FilaVentas } from "./historico";
import { COSTOS_DE_LA_HOJA, sumarPedidos, tasasDe } from "./costos-operacion";
import { dejaCon, estadoRentable, limitesDeProductos } from "./rentabilidad";
import { cortarEnPunto, recortarTexto, REGLA_ALCANCE_DE_CAMPANAS, REGLA_APRENDIZAJE, REGLA_RELEVANCIA, REGLA_TACTICAS } from "./interpretar-ia";

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
/** La rentabilidad de cada producto para el chat (27 nov 2026), con los costos de la calculadora de la hoja (envío $6.27, operativo $2.25) y su CPA de todo el historial. */
function rentabilidadParaChat(a: AnalisisHistorico) {
  const tienda = tasasDe(a.pedidosDeLaTienda ?? (a.entrega.length ? sumarPedidos(a.entrega) : null));
  const porClave = new Map(a.entrega.map((f) => [f.clave, f]));
  const limites = limitesDeProductos(a.economia ?? [], (clave) => {
    const t = tasasDe(porClave.get(clave));
    return { envio: t.envio ?? tienda.envio, entrega: t.entrega ?? tienda.entrega };
  }, COSTOS_DE_LA_HOJA);
  return [...limites].slice(0, 60).map(([clave, l]) => {
    const f = porClave.get(clave);
    const cpaHoy = f?.cpa ?? null;
    return { producto: f?.nombre ?? clave, venta_usd: l.venta, producto_usd: l.producto, unidades_por_pedido: l.unidades, costo_de: l.fuente, cpa: r(cpaHoy), deja_por_venta_entregada: cpaHoy === null ? null : dejaCon(l, cpaHoy), cpa_para_no_perder: l.cpaParaNoPerder, cpa_tope: f?.tope ?? null, cuidado: cpaHoy === null ? null : estadoRentable(cpaHoy, f?.tope ?? 10, l) };
  });
}

export function contextoDeChat(a: AnalisisHistorico, tiendas: readonly string[], hoy: string, investigaciones: readonly unknown[] = [], senales: readonly unknown[] = [], rasgos: readonly unknown[] = []): string {
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
    como_se_calcula: "«funcionó» = al menos $100 gastados, alguna compra y CPA dentro del CPA tope del producto. Tasa de entrega = entregados ÷ (entregados + devueltos) de los pedidos de 180 días. El «cpa_tope» de cada producto es el general ($10) o uno escrito a mano; el general baja cuando el producto envía o entrega peor que la tienda. cpa_por_compra_entregada = gasto ÷ (compras × tasa de envío × tasa de entrega). rentabilidad_por_producto: venta = lo cobrado por pedido entregado; producto = costo de Compras (o de la Matriz) × unidades (un 2x1 cuenta 2), sin flete ni IVA; deja_por_venta_entregada = lo que queda con su CPA; cpa_para_no_perder = el CPA de Meta más alto con el que no se pierde; cuidado = pierde, margen_fino (ya va en el 85 % del límite), sobre_tope_rentable o bien. Úsala para decir si algo es rentable y dónde hay que tener más cuidado.",
    ...(investigaciones.length ? { investigaciones_de_entrega: investigaciones } : {}),
    ...(senales.length ? { senales_de_creativos: senales } : {}),
    ...(rasgos.length ? { rasgos_de_ganadores: rasgos } : {}),
    mes_a_mes_todo: a.meses,
    mes_a_mes_por_producto: a.mesesPorProducto,
    hallazgos: a.hallazgos.slice(0, 60).map((h) => ({ tipo: NOMBRE_CATEGORIA[h.categoria], tono: h.tono, titulo: h.titulo, detalle: h.detalle, motivo: h.motivo ?? null, certeza: h.certeza, ...cualesParaIA(h) })),
    tendencias: a.tendencias
      .filter((t) => t.cambio.sentido !== "poca")
      .slice(0, 120)
      .map((t) => ({ nivel: t.nivel, nombre: t.nombre, ventana: t.ventana === "mes" ? "último mes contra el anterior" : "última semana contra las tres anteriores", sentido: t.cambio.sentido, gasto_reciente_usd: Math.round(t.gastoRec), compras_antes: t.comprasPrev, compras_ahora: t.comprasRec, cpa_antes: r(t.cambio.cpaPrev), cpa_ahora: r(t.cambio.cpaRec), motivo: t.cambio.motivo, ...(t.deQue ? { de_que_son: t.deQue } : {}) })),
    ...(a.economia?.length ? { rentabilidad_por_producto: rentabilidadParaChat(a) } : {}),
    entrega_por_producto: a.entrega.slice(0, 40).map((f) => ({ producto: f.nombre, producto_en_la_tienda: f.enTienda, gasto_usd: Math.round(f.gasto), compras: f.compras, cpa: r(f.cpa), cpa_tope: f.tope, tope_sin_ajustar: f.topeBase ?? f.tope, ...(f.guia ? { vigilar_desde: f.guia.vigilar, apagar_desde: f.guia.apagar, tope_mas_bajo_porque: f.guia.motivo } : {}), tasa_envio: r(f.envio ?? null), tasa_entrega: r(f.tasa), pedidos_resueltos: f.cerradas, entregadas: f.entregadas, devueltas: f.devueltas, canceladas: f.canceladas, cpa_por_compra_entregada: r(f.cpaEntregado), veredicto: f.veredicto })),
    mas_ventas: Object.fromEntries((Object.entries(a.rankings) as [string, FilaVentas[]][]).map(([k, filas]) => [k, filas.map((f) => ({ nombre: f.nombre, ...(f.deQue ? { de_que_son: f.deQue } : {}), compras: f.compras, parte_del_total: r(f.parte), gasto_usd: Math.round(f.gasto), cpa: r(f.cpa), entregadas_estimadas: r(f.comprasEntregadas) }))])),
    bandas_de_metricas: a.bandas.map((b) => ({ metrica: b.titulo, porcentaje_base_que_funciono: r(b.tasaBase), bandas: b.filas.map((f) => ({ banda: f.etiqueta, campanas: f.campanas, funcionaron: f.funcionaron, cpa: r(f.cpa) })) })),
  };
  return JSON.stringify(datos);
}

/** El pedido: las reglas fijas, la conversación hasta ahora, la pregunta y todas las estadísticas. */
export function pedidoChat(a: AnalisisHistorico, tiendas: readonly string[], hoy: string, pregunta: string, historial: readonly MensajeChat[], investigaciones: readonly unknown[] = [], senales: readonly unknown[] = [], rasgos: readonly unknown[] = []): { instrucciones: string; texto: string } {
  const instrucciones = [
    "Eres analista de rendimiento de anuncios de Meta (Facebook e Instagram) de una operación de comercio electrónico con pago contra entrega en Panamá y Costa Rica. Contestas preguntas de quien monta las campañas, que no es analista.",
    "Respondes SOLO con las estadísticas del sistema que recibes en el JSON. No tienes acceso a nada más: no inventes cifras, productos, fechas ni causas. Si el dato que piden no está en el JSON, dilo claramente («eso no está en las estadísticas») y di qué sí hay.",
    "Puedes comparar, restar, calcular porcentajes y ordenar con las cifras del JSON; cuando calcules algo, muestra de qué cifras sale. Para comparar meses usa `mes_a_mes_todo` y `mes_a_mes_por_producto`; para saber qué empeoró y por qué, `tendencias` (el motivo viene ya calculado); para entrega, `entrega_por_producto`.",
    "El mes en curso está incompleto: no lo compares con un mes entero por totales (gasto, compras); usa CPA, CTR, hook, CPM, CVR o promedios por día, y avisa que está incompleto.",
    "Distingue lo comprobado (mucho gasto, certeza firme) de lo que apenas empieza a verse (poca data). Una correlación no es una causa: «se asocia con», no «causa».",
    "Contesta directo y en español claro: primero la respuesta, luego las cifras que la respaldan y, si ayuda, qué hacer. Frases cortas, sin jerga, máximo unas 250 palabras. Usa guiones para listas; no uses tablas ni formato Markdown (sin asteriscos ni almohadillas).",
    "Si la pregunta no tiene que ver con el rendimiento de las campañas, los productos, la entrega o el historial, di amablemente que solo puedes ayudar con eso.",
    REGLA_ALCANCE_DE_CAMPANAS,
    REGLA_TACTICAS,
    REGLA_APRENDIZAJE,
    REGLA_RELEVANCIA,
    `Puedes pedir un análisis nuevo: si para contestar con exactitud hace falta algo que NO está en el JSON (otro rango de fechas, otro desglose, un producto, ángulo o campaña concreto por día o por semana, comparar dos periodos, lo de «esta semana»…), no contestes todavía ni te disculpes: responde SOLO con este JSON, sin texto antes ni después: {"accion":"analizar","analisis":[{...}]} (hasta 2 análisis). Cada análisis lleva: "titulo" (corto), "agrupar" (uno de: ${DIMENSIONES.join(", ")}), "desde" y "hasta" (AAAA-MM-DD, hasta no pasa de hoy), "comparar" opcional ({"desde","hasta"} de otro periodo para ver el cambio), "filtros" opcional (texto que debe contener: ${CLAVES_FILTRO.join(", ")}), "orden" (una de: ${METRICAS.join(", ")}), "sentido" ("asc" o "desc"), "limite" (hasta 15) y "gasto_minimo" (dólares, para dejar fuera lo que casi no gastó). Si la respuesta ya está en el JSON del sistema, contesta directo en texto y no pidas análisis.`,
    `Si la pregunta es POR QUÉ un producto no se entrega o se devuelve (o qué hacer con su entrega), primero mira «investigaciones_de_entrega» del JSON: ya trae las causas que el sistema encontró cruzando pedidos, zona, transportadora, confirmación y lo que escribieron Servientrega, Monday y los asesores. Contesta con esas causas y sus números, sin decir «revisa por qué». Si el producto no está ahí o la persona pide ir más a fondo (leer las conversaciones de WhatsApp de los pedidos devueltos), responde SOLO con: {"accion":"investigar","producto":"nombre del producto como lo dice la persona"}.`,
    `Si la persona te pide que desde ahora le indiques, vigiles o le muestres algo («avísame cuando…», «a partir de ahora…», «vigila…», «quiero que me lo muestres siempre»), responde SOLO con este JSON: {"accion":"vigilar","vigilancia":{"titulo":"...","agrupar":"total|producto|campana|angulo|gancho|formato|cta|estructura|puja|etapa|familia","metrica":"una de: ${METRICAS.join(", ")}","ventana_dias":7|14|30,"umbral_pct":número entre 5 y 200,"gasto_minimo":número,"filtros":{}},"prioridad":"alta|media|baja","mensaje":"una frase que confirma qué vigilarás y con qué prioridad"}. Se compara lo de los últimos ventana_dias días con los anteriores y se marca lo que se mueva más que umbral_pct. La prioridad es la que la persona diga (urgente o muy importante = alta; normal = media; «cuando puedas» = baja); si no dice nada, media. Usa la conversación para saber a qué se refiere («eso», «lo de antes»).`,
  ].join("\n");
  const conversacion = historial.length ? `Conversación hasta ahora:\n${historial.map((m) => `${m.rol === "usuario" ? "Pregunta" : "Respuesta"}: ${m.texto}`).join("\n")}\n\n` : "";
  return { instrucciones, texto: `${conversacion}Pregunta nueva: ${pregunta}\n\nEstadísticas del sistema (JSON):\n${contextoDeChat(a, tiendas, hoy, investigaciones, senales, rasgos)}` };
}

/** La respuesta lista para mostrar: sin formato Markdown que sobre, sin espacios de más y con tope de largo. */
export function limpiarRespuesta(texto: string | null | undefined): string {
  return cortarEnPunto(
    (texto ?? "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^[ \t]*[*•][ \t]+/gm, "- ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    LIMITES_CHAT.respuesta,
  );
}

/** Lo que devolvió la IA: una respuesta de texto, o un pedido para que el sistema corra análisis o deje una vigilancia (siempre JSON, que se valida aparte). */
export type RespuestaChat = { tipo: "investigar"; producto: string } | { tipo: "texto"; texto: string } | { tipo: "analizar"; analisis: unknown[] } | { tipo: "vigilar"; vigilancia: unknown; prioridad: unknown; mensaje: string | null };

export function interpretarRespuestaChat(texto: string | null | undefined): RespuestaChat {
  const t = (texto ?? "").trim();
  const sinCerca = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (sinCerca.startsWith("{")) {
    try {
      const o = JSON.parse(sinCerca.slice(sinCerca.indexOf("{"), sinCerca.lastIndexOf("}") + 1)) as Record<string, unknown>;
      if (o.accion === "investigar" && typeof o.producto === "string" && o.producto.trim()) return { tipo: "investigar", producto: o.producto.replace(/\s+/g, " ").trim().slice(0, 80) };
      if (o.accion === "analizar" && Array.isArray(o.analisis)) return { tipo: "analizar", analisis: o.analisis.slice(0, 2) };
      if (o.accion === "vigilar" && o.vigilancia && typeof o.vigilancia === "object") return { tipo: "vigilar", vigilancia: o.vigilancia, prioridad: o.prioridad, mensaje: typeof o.mensaje === "string" ? recortarTexto(o.mensaje, 400) : null };
    } catch {
      // No era un JSON: se trata como texto.
    }
  }
  return { tipo: "texto", texto: t };
}

/** El segundo pedido, cuando la IA pidió análisis: lo mismo de antes más los resultados que el sistema calculó, y la orden de contestar ya en texto. */
export function pedidoConResultados(pedido: { instrucciones: string; texto: string }, resultados: unknown[]): { instrucciones: string; texto: string } {
  return {
    instrucciones: `${pedido.instrucciones}\nYa se corrieron los análisis que pediste: contesta ahora en texto, usando también sus resultados. No devuelvas JSON ni pidas más análisis. Di en una frase qué análisis nuevo se hizo (fechas y filtros).`,
    texto: `${pedido.texto}\n\nResultados de los análisis nuevos que pediste (JSON, calculados por el sistema sobre los resultados por día):\n${JSON.stringify(resultados)}`,
  };
}
