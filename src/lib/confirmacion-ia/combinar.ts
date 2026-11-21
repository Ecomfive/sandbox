// Confirmación con IA: lo que contestan las dos IA (ChatGPT y Claude) sobre una dirección y cómo se juntan en una sola decisión. Lógica pura, con su prueba.

import type { Zona } from "./zonas";

export type ProveedorModelo = "openai" | "anthropic";

/** Lo que una IA dice de una dirección. `no_se`: no alcanza para decidir la zona. */
export interface RespuestaModelo {
  zona: Zona | "no_se";
  completa: boolean;
  /** Lo único que falta, escrito para pedirlo al cliente («el número de casa o un punto de referencia»); null si está completa. */
  falta: string | null;
  motivo: string;
}

export interface ResultadoModelo {
  proveedor: ProveedorModelo;
  ok: boolean;
  respuesta?: RespuestaModelo;
  error?: string;
}

/** `adelantado`: la dirección es de una zona de pago por adelantado («En espera de pago»): no se propone etiqueta hasta que el asesor verifique el pago. */
export type EstadoAnalisis = "listo" | "falta_dato" | "revisar" | "error" | "adelantado";

export interface Combinado {
  estado: EstadoAnalisis;
  zona: Zona | null;
  /** Quién decidió la zona: una palabra de zona del equipo o las IA. */
  zonaPor: "regla" | "ia" | null;
  completa: boolean | null;
  falta: string | null;
  /** Las dos IA coinciden (en si está completa y, si hacía falta, en la zona); null si solo contestó una. */
  acuerdo: boolean | null;
  motivo: string;
}

/**
 * Aceptar la zona cuando una sola IA decide y la otra dice «no sé» (19 nov 2026, pedido de Jhokser). **Apagado el 21 nov 2026**: la prueba con 150 pedidos nuevos de las tres tiendas (últimos 2 días) mostró que cuando las dos IA
 * coinciden aciertan 44 de 44, pero cuando decide una sola acierta 16 de 20 (80 %). Sin esos casos el acierto de lo que el sistema decide sube de 95 % a 98 % (108 de 110) y esos pedidos vuelven a «Para revisar»
 * (la cobertura baja de ~87 % a ~73 %). Para ponerlo en `true` otra vez: repetir «Probar con pedidos reales» y mirar «una sola IA» en «Quién decidió».
 */
export const ACEPTAR_ZONA_DE_UNA_IA = false;

/** Lo que falta, limpio para ponerlo en un mensaje: sin enlaces ni teléfonos, sin punto final y de hasta 160 letras. */
export function limpiarFalta(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?;:,\s]+$/g, "")
    .slice(0, 160)
    .trim();
  return t.length >= 3 ? t.charAt(0).toLowerCase() + t.slice(1) : null;
}

/** Lee la respuesta de una IA (un JSON, a veces con texto alrededor o en un bloque de código). Null si no sirve. */
export function leerRespuesta(texto: string): RespuestaModelo | null {
  const t = String(texto ?? "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(t.slice(ini, fin + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const zona = String(j.zona ?? "").toLowerCase().trim();
  if (zona !== "ciudad" && zona !== "interior" && zona !== "adelantado" && zona !== "no_se" && zona !== "no_aplica") return null;
  if (typeof j.completa !== "boolean") return null;
  const falta = j.completa ? null : limpiarFalta(j.falta);
  return { zona: zona === "no_aplica" ? "no_se" : zona, completa: j.completa, falta, motivo: String(j.motivo ?? "").trim().slice(0, 400) };
}

/** Si al menos dos IA contestaron, una da ciudad o interior y todas las demás dicen «no sé» (sin ninguna zona distinta), esa zona; si no, null. */
function zonaDeUnaIA(zonas: (Zona | "no_se")[]): Zona | null {
  if (zonas.length < 2) return null;
  const dadas = zonas.filter((z) => z !== "no_se");
  if (dadas.length !== 1) return null;
  return dadas[0] === "ciudad" || dadas[0] === "interior" ? dadas[0] : null;
}

/**
 * La decisión final. La zona la deciden primero las palabras de zona del equipo (`zonaPorReglas`) y, si no hay, las dos IA si coinciden (o una decide y la otra no sabe, `ACEPTAR_ZONA_DE_UNA_IA`); si dicen zonas distintas, queda para revisar.
 * Una dirección está completa solo si todas las IA que contestaron la ven completa; si no, se pide lo que falta (antes que decidir la zona).
 */
export function combinar({ distingueZona, zonaReglas, modelos }: { distingueZona: boolean; zonaReglas: Zona | null; modelos: ResultadoModelo[] }): Combinado {
  const buenos = modelos.filter((m): m is ResultadoModelo & { respuesta: RespuestaModelo } => m.ok && !!m.respuesta);
  if (!buenos.length) return { estado: "error", zona: null, zonaPor: null, completa: null, falta: null, acuerdo: null, motivo: modelos.map((m) => m.error).filter(Boolean).join(" · ") || "Ninguna IA contestó." };

  const completa = buenos.every((m) => m.respuesta.completa);
  const incompleta = buenos.find((m) => !m.respuesta.completa && m.respuesta.falta) ?? buenos.find((m) => !m.respuesta.completa);
  const falta = completa ? null : (incompleta?.respuesta.falta ?? "los datos que faltan de la dirección");

  let zona: Zona | null = null;
  let zonaPor: "regla" | "ia" | null = null;
  if (distingueZona) {
    if (zonaReglas) {
      zona = zonaReglas;
      zonaPor = "regla";
    } else {
      const zonas = buenos.map((m) => m.respuesta.zona);
      if (zonas.every((z) => z === "ciudad" || z === "interior" || z === "adelantado") && new Set(zonas).size === 1) {
        zona = zonas[0] as Zona;
        zonaPor = "ia";
      } else if (ACEPTAR_ZONA_DE_UNA_IA && zonaDeUnaIA(zonas)) {
        zona = zonaDeUnaIA(zonas);
        zonaPor = "ia";
      } else if (!completa && zonas.includes("adelantado") && zonas.every((z) => z === "adelantado" || z === "no_se")) {
        // Con la dirección incompleta una IA puede no saber la zona; si la otra ve pago por adelantado y ninguna dice ciudad o interior, el pago por adelantado manda (18 nov 2026).
        zona = "adelantado";
        zonaPor = "ia";
      }
    }
  }

  const mismaCompleta = new Set(buenos.map((m) => m.respuesta.completa)).size === 1;
  const mismaZona = !distingueZona || zonaReglas !== null || new Set(buenos.map((m) => m.respuesta.zona)).size === 1;
  const acuerdo = buenos.length < 2 ? null : mismaCompleta && mismaZona;
  const motivo = buenos.map((m) => m.respuesta.motivo).filter(Boolean)[0] ?? "";

  // Pago por adelantado (por una palabra de zona o porque las IA lo ven así): queda «en espera de pago», sin etiqueta, y manda sobre «dirección incompleta» (18 nov 2026): primero se cobra y la dirección se
  // pide después. Lo que falta se guarda igual (`falta`) para pedirlo cuando llegue el pago, pero no cambia el estado ni genera el mensaje de «falta un dato».
  if (zona === "adelantado") return { estado: "adelantado", zona: null, zonaPor, completa, falta, acuerdo, motivo };
  if (!completa) return { estado: "falta_dato", zona, zonaPor, completa, falta, acuerdo, motivo };
  if (distingueZona && !zona) return { estado: "revisar", zona: null, zonaPor: null, completa, falta: null, acuerdo, motivo };
  return { estado: "listo", zona, zonaPor, completa, falta: null, acuerdo, motivo };
}

/**
 * Lo que falta, en palabras fijas, para el mensaje que sale solo al cliente (auditoría de seguridad, 18 nov 2026). La dirección la escribe el
 * cliente y la IA la lee junto con direcciones de ejemplo de otros clientes: si la IA siguiera instrucciones escritas en la dirección, su texto
 * libre podría llevarle al cliente la dirección de otro. Por eso el envío automático nunca usa ese texto: se traduce a las frases fijas de
 * `FRASES_FALTA` según las palabras que nombra, y si no nombra ninguna, a una frase general. El asesor sigue viendo en pantalla lo que dijo la IA.
 */
export function faltaParaCliente(falta: string | null | undefined): string {
  const t = String(falta ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const elegidas = FRASES_FALTA.filter((f) => f.claves.some((k) => t.includes(k))).map((f) => f.frase);
  if (!elegidas.length) return FALTA_GENERAL;
  return elegidas.length === 1 ? elegidas[0] : `${elegidas.slice(0, -1).join(", ")} y ${elegidas[elegidas.length - 1]}`;
}

const FALTA_GENERAL = "los datos que faltan de tu dirección (la calle o el sector y el número de casa o un punto de referencia)";
const FRASES_FALTA: { claves: string[]; frase: string }[] = [
  { claves: ["ciudad", "corregimiento", "provincia", "distrito", "canton", "municipio"], frase: "la ciudad o el corregimiento" },
  { claves: ["calle", "sector", "barrio", "avenida", "colonia"], frase: "la calle o el sector" },
  { claves: ["casa", "referencia", "senas"], frase: "el número de casa o un punto de referencia" },
  { claves: ["apartamento", "apto", "oficina", "piso", "local"], frase: "el número de apartamento u oficina" },
  { claves: ["edificio", "urbanizacion", "residencial", "condominio", "torre"], frase: "el nombre del edificio o de la urbanización" },
];

/** El mensaje que pide solo lo que falta de la dirección. */
export function mensajePedirDetalle({ nombre, numero, tienda, falta }: { nombre: string | null; numero: string | null; tienda: string | null; falta: string }): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const saludo = primero ? `Hola ${primero.charAt(0).toUpperCase()}${primero.slice(1).toLowerCase()} 👋` : "Hola 👋";
  const pedido = numero ? `tu pedido ${numero}${tienda ? ` de ${tienda}` : ""}` : "tu pedido";
  return `${saludo} Para poder enviar ${pedido} necesitamos completar tu dirección. ¿Nos puedes escribir ${falta}? ¡Gracias! 🙏`;
}

/**
 * El mensaje que le avisa al cliente que su pedido es de una zona de pago por adelantado y cómo pagar (17 nov 2026). Los métodos de pago son los que se registran por tienda; sin ellos, el mensaje
 * pide el comprobante y dice que un asesor le indica cómo pagar. Lo envía el asesor con un botón (nunca solo).
 */
export function mensajePagoAdelantado({ nombre, numero, tienda, metodos }: { nombre: string | null; numero: string | null; tienda: string | null; metodos: string | null }): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const saludo = primero ? `Hola ${primero.charAt(0).toUpperCase()}${primero.slice(1).toLowerCase()} 👋` : "Hola 👋";
  const pedido = numero ? `tu pedido ${numero}${tienda ? ` de ${tienda}` : ""}` : "tu pedido";
  const como = metodos?.trim() ? `\n\nPuedes pagar así:\n${metodos.trim()}\n\n` : " Un asesor te indicará cómo pagar. ";
  return `${saludo} ${pedido[0].toUpperCase()}${pedido.slice(1)} es para una zona con pago por adelantado. Para poder enviarlo necesitamos que realices el pago y nos envíes el comprobante por este chat.${como}Apenas lo recibamos, lo confirmamos y lo despachamos. ¡Gracias! 🙏`;
}

/** La etiqueta de Shopify que corresponde a una zona, según lo configurado en el país; null si el país no la tiene definida. */
export function etiquetaDeZona(zona: Zona | null, config: { etiquetaCiudad: string | null; etiquetaInterior: string | null }): string | null {
  // El pago por adelantado no tiene etiqueta de envío: la pone el asesor cuando llega el pago.
  if (!zona || zona === "adelantado") return null;
  return (zona === "ciudad" ? config.etiquetaCiudad : config.etiquetaInterior)?.trim() || null;
}
