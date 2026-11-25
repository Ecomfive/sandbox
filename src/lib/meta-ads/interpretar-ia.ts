// Anuncios Meta › Hallazgos › «Interpretar con IA» (24 nov 2026, pedido de Alcides: usar la IA, OpenAI o Claude, para reconocer mejor los patrones y las tendencias del historial). Los números los calcula el sistema
// (`historico.ts`: estadística simple, a la vista y con prueba); la IA **no calcula ni inventa nada**: recibe esas cifras ya armadas y las interpreta para quien monta las campañas (qué patrones se ven,
// qué riesgos hay, qué conviene probar y qué no se puede concluir todavía). Lógica pura, con prueba: cómo se arma el pedido y cómo se valida lo que contesta. La llamada vive en `actions.ts`.

import { NOMBRE_CATEGORIA, type AnalisisHistorico } from "./historico";

export interface PuntoIA {
  titulo: string;
  detalle: string;
}

export interface InterpretacionIA {
  resumen: string;
  patrones: PuntoIA[];
  riesgos: PuntoIA[];
  recomendaciones: PuntoIA[];
  /** Lo que los datos todavía no permiten concluir o lo que convendría medir. */
  limites: string[];
}

/** Cuánto se acepta de cada parte de la respuesta (para que una respuesta larga o rara no desborde la pantalla). */
export const LIMITES_IA = { resumen: 1000, puntos: 6, titulo: 140, detalle: 900, limites: 5, limite: 320 } as const;

const r1 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/**
 * Lo que sí puede hacer o cambiar quien monta las campañas, y lo que no (24 nov 2026, pedido de Alcides: las recomendaciones traían «confirmar por llamada o WhatsApp el mismo día del despacho», «cobro previo»…, que ni Ariadne ni las personas que
 * llevan las campañas pueden hacer). Se le dice a las dos IA (la que interpreta y la del chat); las acciones fijas del sistema ya van escritas con este mismo alcance.
 */
export const REGLA_ALCANCE_DE_CAMPANAS = [
  "ALCANCE DE LAS RECOMENDACIONES: recomienda SOLO lo que puede hacer o cambiar quien monta las campañas: crear, duplicar, pausar o cambiar campañas, presupuestos, estructura (CBO o ABO) y puja; la segmentación (países, zonas y públicos); subir, rotar o quitar videos y anuncios; cambiar ángulos, ganchos, textos, ofertas y la promesa del anuncio; y cambiar o probar landings y páginas, incluido el precio que se muestra en ellas: puedes sugerir probar un precio más alto o más bajo SOLO cuando sea realmente necesario (por ejemplo margen o competencia que lo justifiquen con las cifras que recibes), diciendo que ellos lo evalúan y deciden.",
  "NO recomiendes nada que dependa de otras áreas: confirmar pedidos por llamada o WhatsApp, cobro previo o pago por adelantado, despachar o no despachar, transportadoras o rutas, inventario o compras, ni «hablar con» o «pedir a» otra área.",
  "Si la causa de un problema está en otra área (por ejemplo devoluciones porque los clientes no contestan), puedes nombrarla como dato para entender el resultado, pero la recomendación debe ser algo de campañas: mover presupuesto a las zonas o productos que sí se entregan, separar o excluir una zona con muchas devoluciones, o ajustar la promesa del anuncio y la landing para atraer a quien sí recibe el pedido.",
  "La meta de costo por entrega es una referencia para medir, no una acción.",
].join(" ");

/**
 * Deja un texto en una línea y, si se pasa del largo, lo corta en un punto natural (el final de una frase o, si no hay, el de una palabra, con «…») para que nunca quede una frase cortada a la mitad (24 nov 2026, pedido de Alcides: se leía «…verificar que el cliente t»).
 */
export function recortarTexto(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return cortarEnPunto(v.replace(/\s+/g, " ").trim(), max);
}

/** Como `recortarTexto` pero respetando los saltos de línea (la respuesta del chat lleva listas). */
export function cortarEnPunto(t: string, max: number): string {
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("; "), corte.lastIndexOf("? "), corte.lastIndexOf("! "), corte.lastIndexOf("\n"));
  if (fin >= max * 0.5) return corte.slice(0, fin + 1).trimEnd();
  const espacio = Math.max(corte.lastIndexOf(" "), corte.lastIndexOf("\n"));
  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).replace(/[,;:\s]+$/, "")}…`;
}

/** El pedido: las reglas fijas y el resumen del análisis (solo lo necesario: lo más grande de cada tabla). Va todo en JSON para que la IA lea cifras, no frases. */
export function pedidoInterpretacion(a: AnalisisHistorico, investigaciones: readonly unknown[] = [], senalesCreativas: readonly unknown[] = [], rasgos: readonly unknown[] = []): { instrucciones: string; texto: string } {
  const instrucciones = [
    "Eres analista de rendimiento de anuncios de Meta (Facebook e Instagram) para una operación de comercio electrónico con pago contra entrega en Panamá y Costa Rica.",
    "Recibes estadísticas ya calculadas por el sistema sobre el historial de campañas, anuncios y videos, la tasa de entrega de cada producto y las tendencias recientes.",
    "Reglas: usa SOLO las cifras que recibes; no inventes números, productos ni causas que no se vean en ellas. Si algo tiene poca data (certeza «poca» o «probable», pocos videos o poco gasto), dilo en vez de afirmarlo.",
    "Distingue lo que ya está comprobado en el historial de lo que apenas empieza a verse. Una correlación no es una causa: di «se asocia con», no «causa».",
    "El resultado «funcionó» significa que la campaña o el video tuvo gasto suficiente y su CPA quedó dentro del CPA tope de su producto; no hay cálculo de costos reales todavía.",
    "Da importancia a la tasa de entrega: un producto que vende bien en Meta pero entrega mal cuesta más por venta real.",
    "Escribe para quien monta las campañas, que no es analista: español claro, frases cortas, sin jerga. Cada punto lleva un título corto y un detalle con las cifras que lo respaldan y qué hacer.",
    REGLA_ALCANCE_DE_CAMPANAS,
    'Responde SOLO con un JSON válido de esta forma: {"resumen": string, "patrones": [{"titulo": string, "detalle": string}], "riesgos": [{"titulo": string, "detalle": string}], "recomendaciones": [{"titulo": string, "detalle": string}], "limites": [string]}.',
    `Máximo ${LIMITES_IA.puntos} elementos en patrones, riesgos y recomendaciones, y ${LIMITES_IA.limites} en limites. «limites» = lo que los datos todavía no permiten concluir o lo que convendría empezar a medir.`,
    "Largos: el resumen de hasta 600 caracteres y cada detalle de hasta 450; termina siempre las frases (nunca dejes una a medias): si no cabe todo, di menos y prioriza lo que más importa.",
    investigaciones.length
      ? "Recibes además «investigaciones_de_entrega»: por qué no se entregan los productos que más devuelven, buscado por el sistema en los pedidos, la zona, la transportadora, la confirmación, lo que escribieron Servientrega, Monday y los asesores y, a veces, las conversaciones de WhatsApp. NO recomiendes «revisa por qué vuelven los pedidos»: usa las causas encontradas (con sus números) y da la acción concreta; si la investigación no encontró una causa clara, dilo y di qué dato falta. Para cada producto con investigación, el costo por entrega objetivo es el que viene en el JSON."
      : "Si un producto vende bien pero entrega mal y no recibes la causa, no digas «revisa por qué vuelven»: di que todavía no se investigó y qué se necesita para saberlo.",
    rasgos.length
      ? "Recibes además «rasgos_de_ganadores»: por métrica (CTR, hook, clic a visita, conversión de la página), qué comparten los anuncios o las páginas que cayeron en la zona buena y funcionaron (lo que comparten) y qué casi nunca tienen, con cuántos de cuántos. Cuando recomiendes mejorar algo de esa métrica, di en concreto cómo parecerse a los que funcionaron (por ejemplo «los anuncios con CTR de 3 % o más empiezan con una pregunta: 6 de 8») y no solo «sube el CTR»; son asociaciones, no causas: dilo con «se asocia con»."
      : "",
    senalesCreativas.length
      ? "Recibes además «senales_de_creativos»: por producto, si sus videos se están cansando, si el gasto depende de un solo video o de videos viejos, si hace días que no se sube nada nuevo y qué ángulo ha funcionado mejor. Cada producto puede traer «lo_que_paso_en_otros_modulos»: inventario agotado o bajo, cambio de precio de venta, margen bajo, competidores que venden lo mismo más barato y cómo rindió en su test. Si una de esas causas coincide con el empeoramiento, ponla primero: no tiene sentido pedir más creativos si el producto está agotado. Cuando un producto empeore, explica el porqué con estas señales (con sus números) y da la acción concreta; no digas solo «renueva los creativos»."
      : "",
  ].join("\n");

  const datos = {
    resumen: {
      campanas: a.resumen.campanas,
      videos: a.resumen.videos,
      gasto_usd: Math.round(a.resumen.gasto),
      compras: a.resumen.compras,
      desde: a.resumen.desde,
      hasta: a.resumen.hasta,
      tasa_entrega_promedio: r1(a.resumen.tasaEntrega),
      campanas_medibles: a.resumen.campanasMedibles,
      porcentaje_que_funciono: r1(a.resumen.tasaFuncionaron),
    },
    hallazgos: a.hallazgos.slice(0, 30).map((h) => ({ tipo: NOMBRE_CATEGORIA[h.categoria], tono: h.tono, titulo: h.titulo, detalle: h.detalle, motivo: h.motivo ?? null, certeza: h.certeza })),
    bandas: a.bandas.map((b) => ({ metrica: b.titulo, porcentaje_base_que_funciono: r1(b.tasaBase), bandas: b.filas.map((f) => ({ banda: f.etiqueta, campanas: f.campanas, funcionaron: f.funcionaron, cpa: r1(f.cpa) })) })),
    entrega_por_producto: a.entrega.slice(0, 15).map((f) => ({ producto: f.nombre, gasto_usd: Math.round(f.gasto), compras: f.compras, cpa: r1(f.cpa), cpa_tope: f.tope, tasa_entrega: r1(f.tasa), pedidos_resueltos: f.cerradas, cpa_por_compra_entregada: r1(f.cpaEntregado), veredicto: f.veredicto })),
    mas_ventas: {
      productos: a.rankings.productos.slice(0, 6).map((f) => ({ nombre: f.nombre, compras: f.compras, cpa: r1(f.cpa), entregadas_estimadas: r1(f.comprasEntregadas) })),
      angulos: a.rankings.angulos.slice(0, 6).map((f) => ({ nombre: f.nombre, compras: f.compras, cpa: r1(f.cpa) })),
      ganchos: a.rankings.ganchos.slice(0, 6).map((f) => ({ nombre: f.nombre, compras: f.compras, cpa: r1(f.cpa) })),
      formatos: a.rankings.formatos.slice(0, 5).map((f) => ({ nombre: f.nombre, compras: f.compras, cpa: r1(f.cpa) })),
    },
    tendencias: a.tendencias
      .filter((t) => t.cambio.sentido === "baja" || t.cambio.sentido === "mejora")
      .slice(0, 14)
      .map((t) => ({ nivel: t.nivel, nombre: t.nombre, ventana: t.ventana === "mes" ? "último mes contra el anterior" : "última semana contra las tres anteriores", sentido: t.cambio.sentido, cpa_antes: r1(t.cambio.cpaPrev), cpa_ahora: r1(t.cambio.cpaRec), motivo: t.cambio.motivo })),
  };
  const investigado = (investigaciones.length ? `\n\nInvestigaciones de entrega (JSON):\n${JSON.stringify(investigaciones)}` : "") + (senalesCreativas.length ? `\n\nsenales_de_creativos (JSON):\n${JSON.stringify(senalesCreativas)}` : "") + (rasgos.length ? `\n\nrasgos_de_ganadores (JSON):\n${JSON.stringify(rasgos)}` : "");
  return { instrucciones, texto: `Estadísticas del sistema (JSON):\n${JSON.stringify(datos)}${investigado}` };
}

const texto = recortarTexto;

function puntos(v: unknown): PuntoIA[] {
  if (!Array.isArray(v)) return [];
  const out: PuntoIA[] = [];
  for (const p of v) {
    if (!p || typeof p !== "object") continue;
    const titulo = texto((p as Record<string, unknown>).titulo, LIMITES_IA.titulo);
    const detalle = texto((p as Record<string, unknown>).detalle, LIMITES_IA.detalle);
    if (titulo && detalle) out.push({ titulo, detalle });
    if (out.length >= LIMITES_IA.puntos) break;
  }
  return out;
}

/** Lo que contestó la IA, validado: null si no es un JSON con un resumen (la pantalla dice que no se pudo interpretar). Nunca lanza. */
export function leerInterpretacion(contestacion: string | null | undefined): InterpretacionIA | null {
  if (!contestacion) return null;
  const limpio = contestacion.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  let o: unknown;
  try {
    o = JSON.parse(limpio.slice(ini, fin + 1));
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const resumen = texto(r.resumen, LIMITES_IA.resumen);
  if (!resumen) return null;
  const limites = Array.isArray(r.limites) ? r.limites.map((l) => texto(l, LIMITES_IA.limite)).filter(Boolean).slice(0, LIMITES_IA.limites) : [];
  return { resumen, patrones: puntos(r.patrones), riesgos: puntos(r.riesgos), recomendaciones: puntos(r.recomendaciones), limites };
}
