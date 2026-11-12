// Unir dos fichas del mismo dropshipper (11 nov 2026, pedido de Jhokser: un dropshipper puede vender en varios países y plataformas, y a veces tiene una ficha por país).
// La base hace el trabajo (`crm_unir_dropshippers`, migración 0272: pasa a la ficha que queda todo lo vinculado a la otra y borra la sobrante, o se niega); aquí vive lo que
// decide cuál queda y cómo se le dice a la persona lo que se movió. Lógica pura, con su prueba.

/** Lo que hace falta de una ficha para decidir cuál de dos se queda. */
export interface FichaParaElegir {
  id: string;
  codigo: string;
  /** Fecha de ingreso (AAAA-MM-DD) o, si falta, la de creación. */
  desde: string | null;
}

/**
 * Cuál de las dos se queda: la más antigua. Las que se cargaron de una vez comparten fecha, así que desempata el código («DS-0012» antes que «DS-0140») y, al final, el id,
 * para que el resultado nunca dependa del orden en que llegan.
 */
export function elegirFichaConservada<T extends FichaParaElegir>(a: T, b: T): { conservar: T; eliminar: T } {
  const tiempo = (f: T) => {
    const t = f.desde ? Date.parse(f.desde) : NaN;
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  const primero = (x: T, y: T): boolean => {
    if (tiempo(x) !== tiempo(y)) return tiempo(x) < tiempo(y);
    const c = x.codigo.localeCompare(y.codigo, "es", { numeric: true });
    if (c !== 0) return c < 0;
    return x.id < y.id;
  };
  return primero(a, b) ? { conservar: a, eliminar: b } : { conservar: b, eliminar: a };
}

/** Lo que pasa a la otra ficha, dicho como lo ve el equipo: [uno, varios]. */
const NOMBRE_MOVIDO: Record<string, [string, string]> = {
  dropshipper_cuentas: ["cuenta de plataforma", "cuentas de plataforma"],
  dropshipper_paises: ["país donde vende", "países donde vende"],
  dropshipper_vende_en: ["plataforma de «dónde vende»", "plataformas de «dónde vende»"],
  whatsapp_conversaciones: ["chat de WhatsApp", "chats de WhatsApp"],
  casos_dropshipper: ["caso", "casos"],
  tareas_dropshipper: ["tarea", "tareas"],
  interacciones_dropshipper: ["interacción", "interacciones"],
  pedidos_dropshipper: ["pedido anotado a mano", "pedidos anotados a mano"],
  dropshipper_comentarios: ["comentario", "comentarios"],
  dropshipper_adjuntos: ["archivo adjunto", "archivos adjuntos"],
  sugerencias_clientes: ["sugerencia de producto", "sugerencias de producto"],
  crm_alertas_atendidas: ["alerta atendida", "alertas atendidas"],
  dropshipper_telefonos: ["otro número de WhatsApp", "otros números de WhatsApp"],
  dropshipper_correos: ["otro correo", "otros correos"],
};

/**
 * Lo que la base movió (o movería) a la ficha que queda, como frases: «2 cuentas de plataforma», «1 chat de WhatsApp», «el WhatsApp pasa a otros números». Lo que se llama
 * igual se suma; de más a menos. Una tabla que no está en la lista sale con su nombre tal cual.
 */
export function lineasDeUnion(movido: Record<string, unknown> | null | undefined): string[] {
  const suma = new Map<string, { n: number; nombre: [string, string] }>();
  const aparte: string[] = [];
  for (const [clave, valor] of Object.entries(movido ?? {})) {
    if (clave === "contacto_telefono") {
      if (valor === true) aparte.push("su WhatsApp pasa a los otros números de la ficha que queda");
      continue;
    }
    if (clave === "contacto_email") {
      if (valor === true) aparte.push("su correo pasa a los otros correos de la ficha que queda");
      continue;
    }
    const n = Number(valor);
    if (!(n > 0)) continue;
    const tabla = clave.split(".")[0];
    const nombre = NOMBRE_MOVIDO[tabla] ?? ([tabla.replace(/_/g, " "), tabla.replace(/_/g, " ")] as [string, string]);
    const antes = suma.get(nombre[0]);
    suma.set(nombre[0], { n: (antes?.n ?? 0) + n, nombre });
  }
  const lineas = [...suma.values()].sort((a, b) => b.n - a.n).map(({ n, nombre }) => `${n} ${n === 1 ? nombre[0] : nombre[1]}`);
  return [...lineas, ...aparte];
}

/**
 * El motivo que la base da cuando se niega a unir («No se unen X y Y: …») viene escrito para el equipo y se muestra tal cual; cualquier otro error de la base no se enseña.
 */
export function mensajeErrorUnirDropshippers(mensaje: string | null | undefined): string {
  const m = (mensaje ?? "").trim();
  return /^(No se unen|Elige dos dropshippers|La ficha que se)/.test(m) ? m : "No se pudieron unir las fichas.";
}
