// Anuncios Meta › lo que pasó con el producto en otros módulos del sistema (24 nov 2026, pedido de Alcides: «analizar todo lo disponible en el sistema para dar una mejor respuesta», sin datos financieros ni delicados). Cuando un producto
// empeora en Meta, a veces la causa no está en los anuncios: se acabó el inventario, cambió el precio de venta, un competidor bajó el suyo o el producto ya rendía menos en su prueba. Aquí está la parte pura (con prueba): con lo que se leyó de
// Inventario, Gestión de IDs Dropi, Análisis de competencia y Test productos se arman las señales. Cada una dice de qué módulo salió (`modulo`), para mostrarla solo a quien lo puede abrir. Los datos los lee `senales-modulos-datos.ts`.
//
// REGLA: aquí solo entran datos operativos del producto (stock, precio de venta, competencia, resultado de su prueba). Nunca datos financieros (costos de la empresa, bancos, retiros, nómina), de personas ni de clientes.
// Un módulo nuevo se suma agregando su lectura en `senales-modulos-datos.ts`, su caso en `senalesDeModulos` y su clave en `MODULOS_DE_SENALES`.

/** Los módulos de los que se leen señales (la clave de permisos de cada uno). */
export const MODULOS_DE_SENALES = ["inventario", "publicaciones-dropi", "analisis-competencia", "productos-test"] as const;
export type ModuloSenal = (typeof MODULOS_DE_SENALES)[number];
export const NOMBRE_MODULO_SENAL: Record<ModuloSenal, string> = { inventario: "Inventario", "publicaciones-dropi": "Gestión de IDs Dropi", "analisis-competencia": "Análisis de competencia", "productos-test": "Test productos" };

export type Gravedad = "alta" | "media" | "info";
export interface SenalModulo {
  modulo: ModuloSenal;
  tipo: "sin_stock" | "poco_stock" | "precio_cambio" | "margen_bajo" | "competencia" | "mas_baratos" | "test_mejor";
  titulo: string;
  detalle: string;
  accion: string;
  gravedad: Gravedad;
}

/** Lo que se leyó de cada módulo para un producto (null o vacío = no hay dato; no es lo mismo que «está bien»). */
export interface DatosModulos {
  stock: { disponible: number; enCamino: number; salidas30: number } | null;
  precios: { precio: number; margen: number | null; ultimoCambio: string | null }[];
  competencia: { avisos: { fecha: string; titulo: string }[]; masBaratos: { competidores: number; minimo: number; nuestro: number } | null };
  test: { fecha: string | null; cpa: number | null; cvr: number | null; estado: string | null } | null;
}

export const UMBRALES_MODULOS = {
  /** Días de inventario por debajo de los cuales se avisa. */
  diasPocoStock: 7,
  /** Días hacia atrás en que un cambio de precio o una alerta de competencia sigue contando. */
  diasReciente: 21,
  /** Margen (0 a 1) por debajo del cual el precio de venta deja poco. */
  margenBajo: 0.15,
  /** Cuánto peor es el CPA de hoy frente al de su test para decirlo. */
  peorQueElTest: 1.3,
} as const;

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * Las señales de un producto a `hoy`. `cpaActual` es el CPA reciente del producto en Meta (para compararlo con el de su test); `gasto14` lo que gastó en los últimos 14 días (si gasta con el inventario agotado, es dinero perdido).
 * Primero las graves.
 */
export function senalesDeModulos(d: DatosModulos, o: { hoy: string; cpaActual: number | null; gasto14: number }): SenalModulo[] {
  const U = UMBRALES_MODULOS;
  const out: SenalModulo[] = [];

  if (d.stock) {
    const ritmo = d.stock.salidas30 / 30;
    if (d.stock.disponible <= 0) {
      out.push({
        modulo: "inventario",
        tipo: "sin_stock",
        titulo: `Sin inventario disponible mientras se gastan ${usd(o.gasto14)} en anuncios (14 días)`,
        detalle: d.stock.enCamino > 0 ? `No hay unidades disponibles y vienen ${d.stock.enCamino} en camino.` : "No hay unidades disponibles ni en camino.",
        accion: d.stock.enCamino > 0 ? "Bajar o pausar el gasto hasta que llegue el inventario: cada compra que entra sin stock es un pedido que no se puede cumplir." : "Pausar las campañas del producto hasta reponer: se está pagando por pedidos que no se pueden cumplir.",
        gravedad: "alta",
      });
    } else if (ritmo > 0 && d.stock.disponible / ritmo < U.diasPocoStock) {
      const dias = Math.max(1, Math.floor(d.stock.disponible / ritmo));
      out.push({
        modulo: "inventario",
        tipo: "poco_stock",
        titulo: `Inventario para unos ${dias} ${dias === 1 ? "día" : "días"} al ritmo de salida de los últimos 30`,
        detalle: `Quedan ${d.stock.disponible} disponibles, salen unas ${ritmo.toFixed(1)} al día${d.stock.enCamino > 0 ? ` y vienen ${d.stock.enCamino} en camino` : " y no viene nada en camino"}.`,
        accion: d.stock.enCamino > 0 ? "Cuidar el ritmo de gasto hasta que llegue lo que viene en camino." : "Bajar el gasto o pausar las campañas del producto antes de que se agote: si se agota, siguen gastando sin poder entregar.",
        gravedad: d.stock.enCamino > 0 ? "media" : "alta",
      });
    }
  }

  const recientes = d.precios.filter((p) => p.ultimoCambio && diasEntre(p.ultimoCambio, o.hoy) <= U.diasReciente && diasEntre(p.ultimoCambio, o.hoy) >= 0);
  if (recientes.length) {
    const p = recientes.sort((a, b) => b.ultimoCambio!.localeCompare(a.ultimoCambio!))[0];
    const dias = diasEntre(p.ultimoCambio!, o.hoy);
    out.push({
      modulo: "publicaciones-dropi",
      tipo: "precio_cambio",
      titulo: `El precio de venta cambió hace ${dias} ${dias === 1 ? "día" : "días"} (hoy ${usd(p.precio)})`,
      detalle: "Un precio distinto cambia lo que ve el cliente y, con eso, el clic y la compra: la caída puede coincidir con ese cambio.",
      accion: "Comparar el CPA y la conversión de antes y después de esa fecha; si empeoraron, probar una oferta o una promesa en el anuncio y la landing que justifique el precio nuevo.",
      gravedad: "media",
    });
  }
  const bajos = d.precios.filter((p) => p.margen !== null && p.margen < U.margenBajo);
  if (bajos.length) {
    const p = bajos.sort((a, b) => a.margen! - b.margen!)[0];
    out.push({
      modulo: "publicaciones-dropi",
      tipo: "margen_bajo",
      titulo: `El precio de venta deja un margen de ${Math.round(p.margen! * 100)} %`,
      detalle: `Con ese margen, el CPA tope se queda corto: un CPA que parece bueno en Meta puede dejar poco o perder al contar el costo del producto.`,
      accion: "No escalar este producto mientras el margen sea bajo, y mantener el CPA muy por debajo del tope.",
      gravedad: p.margen! < 0 ? "alta" : "media",
    });
  }

  const m = d.competencia.masBaratos;
  if (m && m.competidores > 0 && m.minimo < m.nuestro * 0.9) {
    out.push({
      modulo: "analisis-competencia",
      tipo: "mas_baratos",
      titulo: `${m.competidores} ${m.competidores === 1 ? "competidor vende" : "competidores venden"} el mismo producto más barato (desde ${usd(m.minimo)} frente a nuestros ${usd(m.nuestro)})`,
      detalle: "Cuando el dropshipper compara, se queda con el más barato: eso encarece cada compra en Meta aunque el anuncio sea bueno.",
      accion: `Su precio más bajo es ${usd(m.minimo)} frente a nuestros ${usd(m.nuestro)}: mejorar la oferta y la promesa del anuncio y la landing, o dejar de empujar este producto.`,
      gravedad: "media",
    });
  }
  const avisos = d.competencia.avisos.filter((c) => diasEntre(c.fecha, o.hoy) <= U.diasReciente);
  if (avisos.length) {
    out.push({
      modulo: "analisis-competencia",
      tipo: "competencia",
      titulo: `${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"} de la competencia en los últimos ${U.diasReciente} días`,
      detalle: avisos.slice(0, 3).map((c) => `«${c.titulo}»`).join(" "),
      accion: "Si lo que cambió en la competencia coincide con la fecha en que empezó a empeorar, ajustar la oferta y la promesa del anuncio frente a ese competidor.",
      gravedad: "info",
    });
  }

  if (d.test && d.test.cpa !== null && o.cpaActual !== null && o.cpaActual > d.test.cpa * U.peorQueElTest) {
    out.push({
      modulo: "productos-test",
      tipo: "test_mejor",
      titulo: `En su test el CPA fue ${usd(d.test.cpa)}; hoy es ${usd(o.cpaActual)}`,
      detalle: `${d.test.estado ? `El test quedó «${d.test.estado}»` : "El test"}${d.test.fecha ? ` (${d.test.fecha.slice(0, 10)})` : ""}. Hoy cuesta ${Math.round((o.cpaActual / d.test.cpa - 1) * 100)} % más conseguir una compra que cuando se probó.`,
      accion: "Volver a lo que funcionó en el test (ángulo, video, oferta) y compararlo con lo que corre hoy.",
      gravedad: "info",
    });
  }

  const rango: Record<Gravedad, number> = { alta: 0, media: 1, info: 2 };
  return out.sort((a, b) => rango[a.gravedad] - rango[b.gravedad]);
}

/** Lo que se le da a la IA de esas señales. */
export function senalesModulosParaIA(s: readonly SenalModulo[]): unknown {
  return s.map((x) => ({ modulo: NOMBRE_MODULO_SENAL[x.modulo], tipo: x.tipo, gravedad: x.gravedad, titulo: x.titulo, detalle: x.detalle, accion: x.accion }));
}

/** Solo las señales de los módulos que la persona puede abrir. */
export function senalesVisibles<T extends { modulo: string }>(senales: readonly T[], modulosDePersona: readonly string[]): T[] {
  return senales.filter((s) => modulosDePersona.includes(s.modulo));
}
