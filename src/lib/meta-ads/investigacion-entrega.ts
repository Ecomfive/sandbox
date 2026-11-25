// Anuncios Meta › por qué no se entrega un producto (24 nov 2026, pedido de Alcides: «no solo plantear las preguntas, también el por qué… buscar la respuesta entre todo lo que está en el sistema»). Cuando un producto vende pero sus pedidos
// vuelven, no basta decir «revisa por qué»: se cruzan sus pedidos con la zona del cliente, la transportadora, cómo pagó, si se confirmó, lo que dicen Servientrega y Monday de cada devolución (novedades, causas, observaciones de los asesores) y,
// si se pide a fondo, la conversación de WhatsApp del cliente. Aquí está la parte pura (con prueba): clasificar los motivos escritos, comparar los grupos contra el promedio del producto, decidir cuál es el factor que explica las
// devoluciones y armar lo que se le muestra a la persona y a la IA. Quien lee la base está en `investigacion-datos.ts`.

export type EstadoOrden = "entregada" | "devuelta" | "cancelada" | "no_gestionada" | "en_transito" | "pendiente";

/** Un pedido del producto, con todo lo que el sistema sabe de él de todas las fuentes. */
export interface OrdenInv {
  numero: string;
  fecha: string;
  estado: EstadoOrden;
  total: number;
  /** Unidades de este producto en el pedido. */
  unidades: number;
  /** El pedido trae además otros productos. */
  conOtros: boolean;
  /** Cómo pagó (efectivo, Yappy, transferencia…). */
  pago: string | null;
  /** La transportadora o el mensajero. */
  courier: string | null;
  provincia: string | null;
  /** CIUDAD o INTERIOR, de la etiqueta del pedido. */
  zona: "ciudad" | "interior" | null;
  /** ¿Pasó por «Confirmada»? null = no hay historial para saberlo. */
  confirmada: boolean | null;
  /** Veces que se intentó entregar y no se pudo (Servientrega). */
  visitas: number;
  /** Todo lo que dice algún sistema de por qué no se entregó: el motivo del pedido, la última novedad de Servientrega, la causa de Monday, lo que anotaron los asesores. */
  motivos: string[];
}

// ───────────────────────── Motivos escritos ─────────────────────────

export const RAZONES = ["no_contesta", "rechaza", "sin_dinero", "direccion", "ruta", "ausente", "reprogramar", "producto", "duplicado"] as const;
export type Razon = (typeof RAZONES)[number] | "otro";
export const NOMBRE_RAZON: Record<Razon, string> = {
  no_contesta: "No contestó o no se pudo contactar",
  rechaza: "No quiso el pedido o se arrepintió",
  sin_dinero: "No tenía el dinero",
  direccion: "Dirección mala o fuera de cobertura",
  ruta: "Sin ruta asignada o no atienden ese día",
  ausente: "No estaba o estaba cerrado",
  reprogramar: "Pidió otro día",
  producto: "No era lo que esperaba o llegó mal",
  duplicado: "Pedido repetido",
  otro: "Otro motivo",
};

const REGLAS: [Exclude<Razon, "otro">, RegExp][] = [
  ["duplicado", /duplicad|repetid|doble pedido|ya (lo )?(recibi|compr)/],
  ["sin_dinero", /no (tiene|tenia|cuenta con|le alcanz\w*)\s+(el\s+|con\s+)?(dinero|plata|efectivo|saldo)|sin (dinero|plata|efectivo|saldo)|falta de (dinero|plata|efectivo)/],
  ["no_contesta", /no (contest|respond|atend|se pudo (contactar|comunicar|ubicar por tel))|sin respuesta|no hay (contacto|respuesta)|telefono (apagado|no responde|errado|equivocado)|apagado|no localiz|sin contacto|numero (errado|equivocado)/],
  ["rechaza", /no (lo )?(quiere|quiso|desea|requiere|necesita)|rechaz|se arrepint|desisti|ya no (lo |la )?(quiere|necesita|desea)|cancel\w* (el|su) pedido|no (lo )?solicit|cliente no acepta|no acepta/],
  ["producto", /no (era|es|fue) lo que|diferente a|da[nñ]ad|defect|no le gust|calidad|talla|no sirve|incompleto|equivocad[oa] el producto|producto (errado|equivocado)/],
  ["ruta", /no asignad\w* a ruta|sin ruta|fines? de semana|no atienden|fuera de ruta|ruta no (cubre|atiende)/],
  ["direccion", /direccion|no (se )?(ubic|encontr|halla)|zona (roja|dificil|de riesgo)|fuera de (cobertura|zona)|sin cobertura|no (hay|tiene) (entrega|cobertura)|referencias? (insuficiente|incompleta)/],
  ["reprogramar", /reprogram|pospus|aplaz|para (otro|otra|el) (d[ií]a|lunes|martes|miercoles|jueves|viernes|sabado|domingo)|otro dia|manana lo recibe/],
  ["ausente", /ausente|no (estaba|se encontraba|hab[ií]a)|cerrad[oa]|nadie|no hay quien|no (abri|recib)\w*/],
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Una palabra de estado que no dice por qué («RECHAZADO», «CANCELADO», «DEVUELTO»): vale menos que cualquier explicación escrita. */
const GENERICO = /^(rechazad[oa]|cancelad[oa]|devuelt[oa]|fallid[oa]|anulad[oa]|no entregad[oa]|desintegrad[oa])\.?$/;
export const esGenerico = (texto: string): boolean => GENERICO.test(sinTildes(texto).trim());

/** A qué razón corresponde lo que escribió un sistema o un asesor (la primera regla que calce, en orden de especificidad). */
export function razonDeTexto(texto: string): Razon {
  const t = sinTildes(texto);
  for (const [razon, regla] of REGLAS) if (regla.test(t)) return razon;
  return "otro";
}

/** Quita teléfonos, correos y enlaces de un texto que va a verse o a mandarse a la IA. */
export function limpiarTexto(texto: string, max = 140): string {
  return texto
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[enlace]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[número]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ───────────────────────── Grupos y factores ─────────────────────────

export const UMBRALES_INV = {
  /** Pedidos resueltos (entregados + devueltos) que tiene que tener un grupo para decir algo de él. */
  minResueltos: 8,
  /** Cuántos puntos más de devolución que el promedio del producto para llamarlo un factor. */
  excesoPuntos: 0.12,
  /** Devoluciones que tiene que explicar como mínimo. */
  minDevueltas: 3,
  /** Pedidos resueltos para decir algo del producto en conjunto. */
  minResueltosProducto: 15,
} as const;

export type DimensionInv = "zona" | "provincia" | "courier" | "pago" | "confirmacion" | "tamano" | "otros_productos";
export const NOMBRE_DIMENSION: Record<DimensionInv, string> = {
  zona: "Zona",
  provincia: "Provincia",
  courier: "Transportadora",
  pago: "Forma de pago",
  confirmacion: "Confirmación",
  tamano: "Tamaño del pedido",
  otros_productos: "Con otros productos",
};

export interface GrupoInv {
  dimension: DimensionInv;
  nombre: string;
  resueltos: number;
  devueltos: number;
  /** Devueltos ÷ resueltos (0 a 1). */
  tasaDevolucion: number;
  /** Cuántas devoluciones de más que el promedio del producto (con el mismo número de pedidos). */
  exceso: number;
  /** Es un factor: devuelve claramente más que el producto en general y explica varias devoluciones. */
  factor: boolean;
}

const valorDe = (o: OrdenInv, d: DimensionInv): string | null => {
  switch (d) {
    case "zona": return o.zona === "ciudad" ? "Ciudad" : o.zona === "interior" ? "Interior" : null;
    case "provincia": return o.provincia ? o.provincia.trim() : null;
    case "courier": return o.courier ? o.courier.trim() : null;
    case "pago": return o.pago ? o.pago.trim() : null;
    case "confirmacion": return o.confirmada === null ? null : o.confirmada ? "Confirmado antes de salir" : "Salió sin confirmación registrada";
    case "tamano": return o.unidades >= 2 ? "2 o más unidades" : "1 unidad";
    case "otros_productos": return o.conOtros ? "Con otros productos" : "Solo este producto";
  }
};

const resuelto = (o: OrdenInv) => o.estado === "entregada" || o.estado === "devuelta";

export interface ResumenProductoInv {
  pedidos: number;
  resueltos: number;
  entregados: number;
  devueltos: number;
  /** Entregados ÷ resueltos. null si no hay resueltos. */
  tasaEntrega: number | null;
}
export function resumenDe(ordenes: readonly OrdenInv[]): ResumenProductoInv {
  const entregados = ordenes.filter((o) => o.estado === "entregada").length;
  const devueltos = ordenes.filter((o) => o.estado === "devuelta").length;
  const resueltos = entregados + devueltos;
  return { pedidos: ordenes.length, resueltos, entregados, devueltos, tasaEntrega: resueltos > 0 ? entregados / resueltos : null };
}

/** Compara cada grupo (por zona, provincia, transportadora…) con el promedio del producto: el que devuelve claramente más y explica varias devoluciones es un factor. Los factores primero, por cuántas devoluciones explican de más. */
export function gruposDeDevolucion(ordenes: readonly OrdenInv[]): GrupoInv[] {
  const U = UMBRALES_INV;
  const global = resumenDe(ordenes);
  if (global.resueltos < U.minResueltosProducto) return [];
  const promedio = global.devueltos / global.resueltos;
  const dims: DimensionInv[] = ["zona", "provincia", "courier", "pago", "confirmacion", "tamano", "otros_productos"];
  const out: GrupoInv[] = [];
  for (const d of dims) {
    const m = new Map<string, { r: number; dev: number }>();
    for (const o of ordenes) {
      if (!resuelto(o)) continue;
      const v = valorDe(o, d);
      if (v === null) continue;
      const g = m.get(v) ?? { r: 0, dev: 0 };
      g.r++;
      if (o.estado === "devuelta") g.dev++;
      m.set(v, g);
    }
    // Una dimensión con un solo valor no distingue nada.
    if (m.size < 2) continue;
    for (const [nombre, g] of m) {
      if (g.r < U.minResueltos) continue;
      const tasa = g.dev / g.r;
      const exceso = g.dev - g.r * promedio;
      out.push({ dimension: d, nombre, resueltos: g.r, devueltos: g.dev, tasaDevolucion: tasa, exceso, factor: tasa - promedio >= U.excesoPuntos && g.dev >= U.minDevueltas });
    }
  }
  return out.sort((a, b) => Number(b.factor) - Number(a.factor) || b.exceso - a.exceso);
}

export interface RazonContada {
  razon: Razon;
  devoluciones: number;
  /** Hasta tres frases tal como las escribió el sistema o el asesor (sin teléfonos ni correos). */
  ejemplos: string[];
}

/** Por qué se devolvieron, según lo escrito en Servientrega, Monday y el pedido. `sinMotivo` = devoluciones de las que ningún sistema dice nada. */
export function razonesDeDevolucion(ordenes: readonly OrdenInv[]): { razones: RazonContada[]; conMotivo: number; sinMotivo: number } {
  const m = new Map<Razon, { n: number; ej: string[] }>();
  let conMotivo = 0;
  let sinMotivo = 0;
  for (const o of ordenes) {
    if (o.estado !== "devuelta") continue;
    // Lo que explica de verdad (la novedad de Servientrega, lo que anotó el asesor) va antes que una palabra de estado genérica del pedido.
    const textos = o.motivos.map((t) => t.trim()).filter(Boolean).sort((a, b) => Number(esGenerico(a)) - Number(esGenerico(b)));
    if (!textos.length) {
      sinMotivo++;
      continue;
    }
    conMotivo++;
    // La razón más específica de todo lo que se escribió sobre ese pedido.
    const razones = textos.map(razonDeTexto);
    const razon = razones.find((r) => r !== "otro") ?? "otro";
    const e = m.get(razon) ?? { n: 0, ej: [] };
    e.n++;
    const frase = limpiarTexto(textos[razones.indexOf(razon)] ?? textos[0]);
    if (frase && e.ej.length < 3 && !e.ej.some((x) => sinTildes(x) === sinTildes(frase))) e.ej.push(frase);
    m.set(razon, e);
  }
  const razones = [...m].map(([razon, e]): RazonContada => ({ razon, devoluciones: e.n, ejemplos: e.ej })).sort((a, b) => b.devoluciones - a.devoluciones);
  return { razones, conMotivo, sinMotivo };
}

// ───────────────────────── Lo que dijeron las conversaciones ─────────────────────────

export const RAZONES_CHAT = ["se_arrepintio", "sin_dinero", "no_era_lo_esperado", "no_respondio", "direccion_o_zona", "pidio_otro_dia", "mala_confirmacion", "otro", "sin_informacion"] as const;
export type RazonChat = (typeof RAZONES_CHAT)[number];
export const NOMBRE_RAZON_CHAT: Record<RazonChat, string> = {
  se_arrepintio: "Se arrepintió o ya no lo quería",
  sin_dinero: "No tenía el dinero",
  no_era_lo_esperado: "Esperaba otra cosa del producto",
  no_respondio: "Dejó de responder",
  direccion_o_zona: "Problema de dirección o zona",
  pidio_otro_dia: "Pidió que lo trajeran otro día",
  mala_confirmacion: "La confirmación no quedó clara (precio, producto o condiciones)",
  otro: "Otro motivo",
  sin_informacion: "La conversación no lo dice",
};
export interface ConversacionClasificada {
  numero: string;
  razon: RazonChat;
  evidencia: string;
}

/** El pedido a la IA para leer varias conversaciones de pedidos devueltos y decir por qué no se entregó cada uno. Las conversaciones ya vienen limpias (sin teléfonos). */
export function pedidoConversaciones(producto: string, conversaciones: { numero: string; texto: string }[]): { instrucciones: string; texto: string } {
  return {
    instrucciones: [
      "Eres analista de operaciones de una tienda en línea con pago contra entrega. Lees conversaciones de WhatsApp entre el cliente y la tienda de pedidos que NO se entregaron (se devolvieron) y dices, de cada una, por qué.",
      `Para cada conversación elige UNA razón de esta lista: ${RAZONES_CHAT.join(", ")}. Usa «sin_informacion» si la conversación no permite saberlo; no adivines.`,
      "Escribe además «evidencia»: una frase corta (máximo 120 letras) con lo que dijo el cliente o lo que pasó, sin teléfonos ni datos personales.",
      'Responde SOLO con un JSON: {"conversaciones":[{"numero":"…","razon":"…","evidencia":"…"}]}, una entrada por conversación, con el mismo "numero" que se te dio.',
    ].join("\n"),
    texto: `Producto: ${producto}\n\n${conversaciones.map((c) => `### Pedido ${c.numero}\n${c.texto}`).join("\n\n")}`,
  };
}

export function leerConversacionesClasificadas(texto: string | null | undefined, esperados: readonly string[]): ConversacionClasificada[] {
  const t = (texto ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as { conversaciones?: unknown };
    if (!Array.isArray(o.conversaciones)) return [];
    const out: ConversacionClasificada[] = [];
    for (const c of o.conversaciones) {
      if (!c || typeof c !== "object") continue;
      const { numero, razon, evidencia } = c as Record<string, unknown>;
      if (typeof numero !== "string" || !esperados.includes(numero) || out.some((x) => x.numero === numero)) continue;
      out.push({ numero, razon: (RAZONES_CHAT as readonly string[]).includes(String(razon)) ? (razon as RazonChat) : "otro", evidencia: limpiarTexto(typeof evidencia === "string" ? evidencia : "", 120) });
    }
    return out;
  } catch {
    return [];
  }
}

// ───────────────────────── La investigación completa ─────────────────────────

export interface InvestigacionProducto {
  /** La llave del producto de la campaña y su nombre en la tienda. */
  clave: string;
  producto: string;
  productoEnTienda: string;
  generadaEn: string;
  /** Los últimos N días de pedidos que se miraron. */
  dias: number;
  tiendas: string[];
  resumen: ResumenProductoInv;
  /** Cómo le va a toda la tienda en lo mismo (para saber si es de este producto o de todos). */
  tiendaEntrega: number | null;
  grupos: GrupoInv[];
  razones: RazonContada[];
  conMotivo: number;
  sinMotivo: number;
  /** Lo que dijeron las conversaciones de los pedidos devueltos (solo si se pidió a fondo). */
  conversaciones: { leidas: number; razones: { razon: RazonChat; cuantas: number }[]; ejemplos: { numero: string; razon: RazonChat; evidencia: string }[]; generadaEn: string } | null;
  /** La conclusión: qué explica las devoluciones, en orden de fuerza, con sus números. */
  hallazgos: HallazgoCausa[];
  /** Si de lo que se pagó por compra se entregara al ritmo de la tienda o de la mejor zona: cuánto bajaría el costo por entrega. */
  costo: { cpa: number | null; costoPorEntrega: number | null; cpaObjetivo: number | null } | null;
}

export interface HallazgoCausa {
  tipo: "producto" | "zona" | "provincia" | "courier" | "pago" | "confirmacion" | "tamano" | "otros_productos" | "motivo_courier" | "conversacion";
  titulo: string;
  detalle: string;
  /** Devoluciones que explica de más. */
  fuerza: number;
  /** Qué hacer con esto, con los números. */
  accion: string;
}

const pct = (n: number) => `${Math.round(n * 100)} %`;

/**
 * Arma la conclusión: ¿es del producto o de toda la tienda?, qué grupos devuelven de más (zona, provincia, transportadora, pago, confirmación), qué dicen Servientrega y Monday y qué dijeron las conversaciones; cada una con su acción
 * y sus números. Ordenado por cuántas devoluciones explica. `cpa` y `tope` dan el costo por entrega y el CPA objetivo (el tope del producto, ya ajustado por su envío y entrega).
 */
export function concluir(i: { ordenes: readonly OrdenInv[]; tiendaEntrega: number | null; cpa: number | null; tope?: number | null; conversaciones: InvestigacionProducto["conversaciones"] }): { grupos: GrupoInv[]; razones: ReturnType<typeof razonesDeDevolucion>; hallazgos: HallazgoCausa[]; costo: InvestigacionProducto["costo"]; resumen: ResumenProductoInv } {
  const resumen = resumenDe(i.ordenes);
  const grupos = gruposDeDevolucion(i.ordenes);
  const razones = razonesDeDevolucion(i.ordenes);
  const hallazgos: HallazgoCausa[] = [];
  const tasa = resumen.tasaEntrega;
  if (tasa !== null && i.tiendaEntrega !== null && resumen.resueltos >= UMBRALES_INV.minResueltosProducto) {
    const dif = i.tiendaEntrega - tasa;
    if (dif >= 0.08) {
      hallazgos.push({ tipo: "producto", titulo: `El producto entrega peor que el resto de la tienda: ${pct(tasa)} frente a ${pct(i.tiendaEntrega)}`, detalle: `De ${resumen.resueltos} pedidos resueltos, ${resumen.devueltos} volvieron. La tienda en conjunto entrega ${pct(i.tiendaEntrega)}: el problema es de este producto, no de toda la operación.`, fuerza: Math.round(dif * resumen.resueltos), accion: "Revisar la promesa del anuncio, el precio que se muestra y la landing: que lo que se ve coincida con lo que recibe el cliente, y probar ángulos que atraigan a compradores más decididos." });
    } else if (dif <= -0.03) {
      hallazgos.push({ tipo: "producto", titulo: `Este producto entrega igual o mejor que la tienda: ${pct(tasa)} frente a ${pct(i.tiendaEntrega)}`, detalle: "Si la entrega de la tienda es baja, el problema no es de este producto sino de cómo se confirma o de las zonas que se atienden.", fuerza: 0, accion: "No cambiar los anuncios de este producto por la entrega: lo que se devuelve viene de la operación, no de las campañas. Cuidar el CPA para que el costo por entrega no suba." });
    }
  }
  const accionDe: Record<DimensionInv, (g: GrupoInv, mejor?: GrupoInv) => string> = {
    // Solo acciones que están en manos de quien monta las campañas (segmentación, presupuesto, promesa del anuncio, landing); lo de confirmar, cobrar y despachar es de otras áreas y no se sugiere aquí.
    zona: (g) => (g.nombre === "Interior" ? "Separar el interior en su propia campaña con menos presupuesto, o excluirlo de la segmentación, y mover ese dinero a la ciudad, que sí entrega." : "Revisar si los anuncios prometen una entrega o un horario que en la ciudad no se cumple, y ajustar la promesa del anuncio y de la landing."),
    provincia: (g) => `Bajar el presupuesto o excluir ${g.nombre} de la segmentación de las campañas de este producto, y mover ese dinero a las zonas que sí entregan.`,
    courier: (g) => `Los pedidos que lleva ${g.nombre} devuelven más: concentrar el presupuesto en las zonas con mejor entrega.`,
    pago: (g) => `Los pedidos pagados con «${g.nombre}» se devuelven más: dejar claro en el anuncio y la landing cuánto se paga y cómo, para que llegue quien sí puede pagar.`,
    confirmacion: (g) => (g.nombre.startsWith("Salió") ? "Dato para leer el resultado: los pedidos que salieron sin la confirmación registrada son los que más vuelven. No es de campañas; medir el CPA con lo que sí se entrega." : "Estos pedidos se confirmaron y aun así volvieron: reforzar en el anuncio y la landing lo que el cliente va a recibir y cuánto paga."),
    tamano: (g) => `Los pedidos de ${g.nombre.toLowerCase()} se devuelven más: revisar la oferta que se muestra en el anuncio y la landing.`,
    otros_productos: (g) => `Los pedidos ${g.nombre.toLowerCase()} se devuelven más: revisar que la oferta del anuncio deje claro todo lo que incluye el pedido.`,
  };
  for (const g of grupos.filter((x) => x.factor).slice(0, 4)) {
    hallazgos.push({
      tipo: g.dimension,
      titulo: `${NOMBRE_DIMENSION[g.dimension]} «${g.nombre}»: ${pct(g.tasaDevolucion)} de devoluciones`,
      detalle: `${g.devueltos} de ${g.resueltos} pedidos volvieron, frente a ${pct(resumen.resueltos ? resumen.devueltos / resumen.resueltos : 0)} del producto en general: ${Math.round(g.exceso)} devoluciones de más.`,
      fuerza: Math.max(0, Math.round(g.exceso)),
      accion: accionDe[g.dimension](g),
    });
  }
  const principales = razones.razones.filter((r) => r.razon !== "otro" && r.devoluciones >= 2).slice(0, 2);
  for (const r of principales) {
    hallazgos.push({
      tipo: "motivo_courier",
      titulo: `Según Servientrega, Monday y los asesores: «${NOMBRE_RAZON[r.razon]}» en ${r.devoluciones} de ${razones.conMotivo} devoluciones con motivo`,
      detalle: r.ejemplos.length ? `Por ejemplo: «${r.ejemplos.join("», «")}».` : "",
      fuerza: r.devoluciones,
      accion:
        r.razon === "no_contesta" ? "Los clientes no contestan: atraer compradores más decididos con una promesa clara (precio, pago contra entrega y que se les va a llamar) y mover presupuesto a las zonas donde sí se entrega." :
        r.razon === "rechaza" ? "El cliente se arrepiente al recibir: revisar que el anuncio y la landing no prometan más de lo que es el producto." :
        r.razon === "sin_dinero" ? "Mostrar en el anuncio y la landing el precio total y que se paga contra entrega." :
        r.razon === "direccion" ? "Excluir o bajar el presupuesto en las zonas que la transportadora no cubre bien." :
        r.razon === "ruta" ? "La transportadora no tenía ruta o no atiende fines de semana: bajar el presupuesto de esas zonas." :
        r.razon === "ausente" ? "Decir en la landing que hay que estar disponible para recibir el pedido." :
        r.razon === "reprogramar" ? "Poner en la landing los tiempos de entrega, para que el cliente compre sabiendo cuándo le llega." :
        r.razon === "producto" ? "Revisar la promesa del anuncio y de la landing frente al producto real: lo que llega no coincide con lo que se esperaba." :
        "Revisar que la campaña no esté contando dos veces la misma compra (pedidos repetidos).",
    });
  }
  if (i.conversaciones && i.conversaciones.leidas > 0) {
    const top = [...i.conversaciones.razones].filter((r) => r.razon !== "sin_informacion").sort((a, b) => b.cuantas - a.cuantas)[0];
    if (top) {
      hallazgos.push({
        tipo: "conversacion",
        titulo: `En las conversaciones: «${NOMBRE_RAZON_CHAT[top.razon]}» en ${top.cuantas} de ${i.conversaciones.leidas} leídas`,
        detalle: i.conversaciones.ejemplos.filter((e) => e.razon === top.razon).slice(0, 2).map((e) => `«${e.evidencia}»`).join(" "),
        fuerza: top.cuantas,
        accion:
          top.razon === "mala_confirmacion" ? "Dejar en el anuncio y la landing el precio, el producto y la forma de pago bien explícitos, para que el cliente llegue a la confirmación sabiendo lo que compra." :
          top.razon === "se_arrepintio" ? "Revisar la promesa del anuncio frente a lo que recibe el cliente." :
          top.razon === "sin_dinero" ? "Mostrar el precio total y el pago contra entrega en el anuncio y la landing." :
          top.razon === "no_era_lo_esperado" ? "El anuncio promete algo distinto a lo que es el producto: ajustar el creativo." :
          top.razon === "no_respondio" ? "Probar ángulos y ofertas que atraigan a compradores más decididos y mover presupuesto a lo que sí se entrega." :
          top.razon === "direccion_o_zona" ? "Limitar la segmentación a las zonas que sí se entregan." :
          "Usarlo para entender el resultado de las campañas: no hay una acción propia de campañas.",
      });
    }
  }
  hallazgos.sort((a, b) => b.fuerza - a.fuerza);
  const costo = i.cpa === null ? null : (() => {
    const costoPorEntrega = tasa && tasa > 0 ? i.cpa! / tasa : null;
    return { cpa: Math.round(i.cpa! * 100) / 100, costoPorEntrega: costoPorEntrega === null ? null : Math.round(costoPorEntrega * 100) / 100, cpaObjetivo: i.tope ?? null };
  })();
  return { grupos, razones, hallazgos, costo, resumen };
}

/** Lo que se le da a la IA de una investigación (y a la que interpreta el historial): compacto y con los números tal cual. */
export function textoParaIA(inv: InvestigacionProducto): unknown {
  return {
    producto: inv.producto,
    producto_en_la_tienda: inv.productoEnTienda,
    ultimos_dias: inv.dias,
    pedidos_resueltos: inv.resumen.resueltos,
    entregados: inv.resumen.entregados,
    devueltos: inv.resumen.devueltos,
    tasa_entrega_del_producto: inv.resumen.tasaEntrega === null ? null : Math.round(inv.resumen.tasaEntrega * 100) / 100,
    tasa_entrega_de_la_tienda: inv.tiendaEntrega === null ? null : Math.round(inv.tiendaEntrega * 100) / 100,
    costo: inv.costo,
    causas_encontradas: inv.hallazgos.map((h) => ({ tipo: h.tipo, titulo: h.titulo, detalle: h.detalle, devoluciones_que_explica: h.fuerza, accion: h.accion })),
    grupos_que_devuelven_mas: inv.grupos.filter((g) => g.factor).slice(0, 6).map((g) => ({ dimension: NOMBRE_DIMENSION[g.dimension], grupo: g.nombre, pedidos: g.resueltos, devueltos: g.devueltos, tasa_devolucion: Math.round(g.tasaDevolucion * 100) / 100 })),
    motivos_escritos_por_servientrega_monday_y_asesores: { con_motivo: inv.conMotivo, sin_motivo: inv.sinMotivo, razones: inv.razones.map((r) => ({ razon: NOMBRE_RAZON[r.razon], devoluciones: r.devoluciones, ejemplos: r.ejemplos })) },
    conversaciones_de_whatsapp: inv.conversaciones ? { leidas: inv.conversaciones.leidas, razones: inv.conversaciones.razones.map((r) => ({ razon: NOMBRE_RAZON_CHAT[r.razon], cuantas: r.cuantas })), ejemplos: inv.conversaciones.ejemplos.slice(0, 4) } : "no se han leído",
  };
}

export const claveDeInvestigaciones = (paisId: string) => `investigaciones:${paisId}`;

export interface InvestigacionesGuardadas {
  generadoEn: string;
  items: InvestigacionProducto[];
}

export function leerValorInvestigaciones(valor: unknown): InvestigacionesGuardadas | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<InvestigacionesGuardadas>;
  return typeof v.generadoEn === "string" && Array.isArray(v.items) ? { generadoEn: v.generadoEn, items: v.items.filter((i) => i && typeof i.clave === "string" && i.resumen) } : null;
}

