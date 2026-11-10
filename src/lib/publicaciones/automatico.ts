// Gestión de IDs Dropi sin estados manuales (pedido de Alcides, 21 oct 2026): «En Dropi» y el Tipo salen de lo que reporta Dropi
// (la carga de Ventas Dropi), y en lugar del flujo de trabajo (Producto nuevo, Revisar precio, Verificar con dropshipper, Validar
// bajar precio, Al día) el sistema calcula qué atención necesita cada publicación. Los umbrales salen de la pantalla de Reglas
// (reglas.ts, migración 0127); las constantes de abajo son sus valores de siempre. Sin base ni React, con prueba.

import { claveFecha } from "./cambio-precio";
import { REGLAS_DEFECTO, type Reglas } from "./reglas";

/** Cómo está en Dropi: activo o archivado según Dropi; no aparece (tiene ID pero Dropi no lo reporta: en espera de
 * aprobación si es nuevo, o eliminado); sin ID; o sin datos (el país no tiene ventas de Dropi cargadas). */
export type EnDropi = "activo" | "archivado" | "no_aparece" | "sin_id" | "sin_datos";

export const EN_DROPI: { valor: EnDropi; etiqueta: string; color: string }[] = [
  { valor: "activo", etiqueta: "Activo en Dropi", color: "#30a46c" },
  // Archivado en rojo (pedido de Alcides, 27 oct 2026): el gris casi no se distinguía del verde de activo.
  { valor: "archivado", etiqueta: "Archivado en Dropi", color: "#e5484d" },
  // Lo que no está conectado con Dropi lleva el punto rojo (pedido de Hernán, 27 oct 2026: antes «Sin datos» salía gris y «No aparece», naranja).
  { valor: "no_aparece", etiqueta: "No aparece en Dropi", color: "#e5484d" },
  { valor: "sin_id", etiqueta: "Sin ID de Dropi", color: "#e5484d" },
  { valor: "sin_datos", etiqueta: "Sin datos de Dropi", color: "#e5484d" },
];

export function enDropi(p: { tieneId: boolean; hayCarga: boolean; dropi: { activo: boolean } | null }): EnDropi {
  if (!p.hayCarga) return "sin_datos";
  if (!p.tieneId) return "sin_id";
  if (!p.dropi) return "no_aparece";
  return p.dropi.activo ? "activo" : "archivado";
}

/**
 * Va a «Archivados» del sistema: si Dropi lo tiene archivado. Sin datos de Dropi (otro país, sin ID o no aparece) se respeta lo
 * que se había marcado a mano, para no sacar de golpe lo que ya estaba archivado.
 */
export function estaArchivada(estado: EnDropi, manualArchivada: boolean): boolean {
  if (estado === "activo") return false;
  if (estado === "archivado") return true;
  return manualArchivada;
}

/** Lo que necesita cada publicación (puede ser más de una). Sin ninguna, está al día. */
export type Accion = "margen_bajo" | "ventas_caida" | "vende_poco" | "bajar_precio" | "verificar_dropshipper" | "republicar";

export const ACCIONES: { valor: Accion | "al_dia"; etiqueta: string; color: string; detalle: string }[] = [
  { valor: "margen_bajo", etiqueta: "Margen bajo", color: "#e5484d", detalle: "Margen bruto menor a 30 %" },
  { valor: "ventas_caida", etiqueta: "Ventas en caída", color: "#d9a200", detalle: "Este mes vende menos de la mitad que el anterior" },
  { valor: "vende_poco", etiqueta: "Vende poco", color: "#8e4ec6", detalle: "Vende menos de 100 unidades al mes: revisar el precio" },
  { valor: "bajar_precio", etiqueta: "Competidor más barato", color: "#f76808", detalle: "Alguien vende lo mismo más barato y tiene stock" },
  { valor: "verificar_dropshipper", etiqueta: "Verificar con dropshipper", color: "#e5484d", detalle: "Privatizado a un dropshipper y sin ventas en 30 días" },
  { valor: "republicar", etiqueta: "Republicar", color: "#0090ff", detalle: "30 días sin ninguna venta y es de nuestra bodega" },
  { valor: "al_dia", etiqueta: "Al día", color: "#30a46c", detalle: "Nada que revisar" },
];

/** El detalle de cada tarjeta con los umbrales de las reglas («Margen bruto menor a 25 %»). */
export function detalleAccion(valor: Accion | "al_dia", r: Reglas, codigoPais?: string): string {
  const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("es-PA")} %`;
  if (valor === "margen_bajo") return `Margen bruto menor a ${pct(r.margen_minimo)}`;
  if (valor === "republicar") return `${r.dias_republicar} días sin ninguna venta, es de nuestra bodega (no la ${codigoBodegaDropi(codigoPais)})${r.stock_minimo_republicar > 0 ? ` y tiene ${r.stock_minimo_republicar.toLocaleString("es-PA")} unidades o más` : ""}`;
  if (valor === "vende_poco") return `Activas con stock que venden menos de ${r.venta_minima_mes.toLocaleString("es-PA")} unidades en 30 días: revisar el precio`;
  if (valor === "ventas_caida") return `En 30 días vende menos del ${pct(r.caida_ventas)} de los 30 anteriores`;
  return ACCIONES.find((a) => a.valor === valor)?.detalle ?? "";
}

export const DIAS_NUEVO = 30;
/**
 * Margen bruto mínimo sano para un proveedor en Dropi: 30 %. Del margen bruto todavía salen las devoluciones y los rechazos (10 %
 * de lo pedido en Panamá, jul–oct 2026), las cancelaciones y los costos fijos. Por debajo de 20 % es crítico (casi seguro se
 * pierde); lo saludable es 40 % o más.
 */
export const MARGEN_MINIMO = 0.3;
export const MARGEN_CRITICO = 0.2;
/** Las ventas cayeron si este mes es menos de la mitad del anterior (y el anterior vendió algo que contar). */
export const CAIDA = 0.5;
export const MIN_VENTAS_ANTES = 10;

const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / 86_400_000);

export function accionesPublicacion(
  p: {
    archivada: boolean;
    fechaPublicacion: string | null;
    primeraVenta: string | null;
    margen: number | null;
    netas30: number | null;
    netas30Antes: number | null;
    privatizadaA: string | null;
    competidorMasBarato: boolean;
  },
  hoy: string,
  reglas: Reglas = REGLAS_DEFECTO,
): Accion[] {
  if (p.archivada) return [];
  const out: Accion[] = [];
  const desde = p.fechaPublicacion ?? p.primeraVenta;
  const nuevo = !!desde && dias(desde, hoy) < reglas.dias_nuevo;
  // «Producto nuevo» ya no es una acción (no interesa como tarjeta), pero uno recién publicado todavía no se verifica.
  const margenBajo = p.margen !== null && p.margen < reglas.margen_minimo;
  const cayo = p.netas30 !== null && p.netas30Antes !== null && p.netas30Antes >= reglas.min_ventas_antes && p.netas30 < p.netas30Antes * reglas.caida_ventas;
  // Separadas (21 oct 2026): el margen bajo es un problema de precio o costo; la caída de ventas, de demanda o competencia.
  if (margenBajo) out.push("margen_bajo");
  if (cayo) out.push("ventas_caida");
  if (p.competidorMasBarato) out.push("bajar_precio");
  if (!nuevo && p.privatizadaA && p.netas30 !== null && p.netas30 <= 0) out.push("verificar_dropshipper");
  return out;
}

/** Los días de ventas que mira «Vende poco» y los que espera después de un cambio de precio. */
export const DIAS_VENDE_POCO = 30;

/**
 * Vende poco (7 nov 2026, pedido de Alcides: «si vendo menos de 100 unidades al mes, que me avise para ajustar el precio»): activa en
 * Dropi, con stock, publicada hace más de `dias_nuevo` días (ya tuvo un mes entero) y con menos de `venta_minima_mes` ventas netas en
 * los últimos 30 días. Sin stock no sale (no vende porque no hay qué vender, eso es «Sin stock»), ni sin datos de ventas de Dropi.
 *
 * **Después de un cambio de precio espera 30 días** (7 nov 2026, Alcides: «si le bajo el precio, que salga de ahí y no vuelva hasta que
 * pasen 30 días»): los 30 días que se miran tienen que ser todos con el precio nuevo. Entonces devuelve `espera` con el día en que se
 * vuelve a revisar (el cambio + 30 días), y la tarjeta las cuenta aparte.
 *
 * **«Esperar un mes»** (8 nov 2026, pedido de Alcides: «si después de analizarlo prefiero esperar un mes más»): `esperaHasta` es el día que
 * eligió una persona sin cambiar el precio; hasta ese día no sale. Si las dos esperas corren, manda la que termina más tarde (`por` dice cuál).
 */
export function vendePoco(
  p: { archivada: boolean; enDropi: EnDropi; netas30: number | null; stock: number | null; publicadaDesde: string | null; ultimoCambioPrecio?: string | null; esperaHasta?: string | null },
  hoy: string,
  reglas: Pick<Reglas, "venta_minima_mes" | "dias_nuevo"> = REGLAS_DEFECTO,
): { vende: false; espera: string | null; por?: "precio" | "decision" } | { vende: true } {
  const no = { vende: false as const, espera: null };
  if (p.archivada || p.enDropi !== "activo" || p.netas30 === null || p.stock === null || p.stock <= 0) return no;
  if (!p.publicadaDesde || dias(p.publicadaDesde, hoy) <= reglas.dias_nuevo) return no;
  if (p.netas30 >= reglas.venta_minima_mes) return no;
  let espera: { espera: string; por: "precio" | "decision" } | null = null;
  if (p.ultimoCambioPrecio) {
    const dia = claveFecha(p.ultimoCambioPrecio).slice(0, 10);
    if (dias(dia, hoy) < DIAS_VENDE_POCO) espera = { espera: masDias(dia, DIAS_VENDE_POCO), por: "precio" };
  }
  const decidida = p.esperaHasta?.slice(0, 10);
  if (decidida && decidida > hoy && (!espera || decidida > espera.espera)) espera = { espera: decidida, por: "decision" };
  return espera ? { vende: false, ...espera } : { vende: true };
}

/** El día `n` días después de `dia` (AAAA-MM-DD). */
export const masDias = (dia: string, n: number): string => new Date(Date.parse(`${dia.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** La nota de «Esperar un mes»: obligatoria, de 3 a 300 letras. */
export const MAX_NOTA_ESPERA = 300;
export function revisarNotaEspera(nota: unknown): { nota: string } | { error: string } {
  const t = typeof nota === "string" ? nota.trim().replace(/\s+/g, " ") : "";
  if (t.length < 3) return { error: "Escribe por qué prefieres esperar (por ejemplo: «esperando la temporada»)." };
  if (t.length > MAX_NOTA_ESPERA) return { error: `La nota admite hasta ${MAX_NOTA_ESPERA} letras.` };
  return { nota: t };
}

/** La bodega de Dropi (B280, «Bodega Dropi Panama»): lo que está ahí no se puede republicar, porque la publicación es de Dropi. */
export const BODEGA_DROPI = 280;

/**
 * La bodega de Dropi de cada país: Panamá B280 «Bodega Dropi Panama», Costa Rica B15 «Bodega Dropi San Jose» (28 oct 2026) y México B49
 * «BODEGA DROPI» (31 oct 2026, pedido de Alcides). Lo que está ahí lo maneja Dropi: no se le cambia el stock, no se apaga, no se privatiza ni se
 * republica desde el sistema. Una bodega de Dropi de otro país se agrega aquí.
 */
export const BODEGA_DROPI_POR_PAIS: Readonly<Record<string, number>> = { PA: 280, CR: 15, MX: 49 };
export const BODEGAS_DROPI: ReadonlySet<number> = new Set(Object.values(BODEGA_DROPI_POR_PAIS));
/**
 * Bodegas de ECOMFIVE que Dropi no muestra en «Mis productos» mientras no tienen stock (10 nov 2026, pedido de Alcides: México, la cuenta con que se aplica
 * es la de «MARIA» y su bodega es la 552 Naucalpan, que no salía en «Publicar en Dropi»). Se ofrecen siempre en el formulario; al aplicar, el favorito
 * comprueba que la bodega sea de la cuenta con que se entró a Dropi. Otra bodega sin stock se agrega aquí.
 */
export const BODEGAS_CONOCIDAS_POR_PAIS: Readonly<Record<string, readonly { id: number; nombre: string }[]>> = { MX: [{ id: 552, nombre: "BODEGA NAUCALPAN DE JUÁREZ" }] };
/** El código de la bodega de Dropi del país para los textos: «B280» en Panamá, «B49» en México. Sin país conocido, «B280». */
export const codigoBodegaDropi = (codigoPais?: string | null): string => `B${BODEGA_DROPI_POR_PAIS[(codigoPais ?? "").toUpperCase()] ?? BODEGA_DROPI}`;
export const esBodegaDropi = (id: number | null | undefined): boolean => id !== null && id !== undefined && BODEGAS_DROPI.has(Number(id));

/**
 * Republicar (pedido de Alcides, 22 oct 2026): una publicación activa en Dropi que lleva `dias_republicar` (30) sin ninguna venta
 * se manda a republicar, solo si es de nuestra bodega (no de la B280 de Dropi) y ya lleva publicada al menos esos días. Sin
 * bodega conocida o sin datos de ventas de Dropi, no se sabe: no sale.
 */
export function necesitaRepublicar(
  p: { archivada: boolean; enDropi: EnDropi; bodegaId: number | null; hayVentas: boolean; ultimaVenta: string | null; publicadaDesde: string | null; privada?: boolean; stock?: number | null; netas30?: number | null },
  hoy: string,
  reglas: Pick<Reglas, "dias_republicar"> & Partial<Pick<Reglas, "stock_minimo_republicar">> = REGLAS_DEFECTO,
): boolean {
  // Una privada no se republica (pedido de Alcides, 25 oct 2026): es de un solo dropshipper y republicarla le cambia el ID.
  // Sin stock no se republica (25 oct 2026, pedido de Alcides): no vende porque no hay qué vender, no porque esté vieja.
  if (p.stock != null && p.stock <= 0) return false;
  // Con poco stock tampoco (8 nov 2026, pedido de Alcides: con casi nada de inventario quizá no se vuelva a comprar): menos de
  // `stock_minimo_republicar` (30) unidades no sale. En 0 no hay mínimo. Sin stock conocido, no se sabe: sale como antes.
  const minimo = reglas.stock_minimo_republicar ?? REGLAS_DEFECTO.stock_minimo_republicar;
  if (p.stock != null && minimo > 0 && p.stock < minimo) return false;
  if (p.privada || p.archivada || p.enDropi !== "activo" || !p.hayVentas || p.bodegaId === null || esBodegaDropi(p.bodegaId)) return false;
  const n = reglas.dias_republicar;
  // Con la regla en 30 días, cuentan las ventas netas (un pedido cancelado, rechazado o devuelto no es venta; 25 oct 2026, PUB-0132:
  // su único pedido en 30 días se canceló). Sin netas en 30 días, sale si lleva al menos esos días publicada.
  if (n === 30 && p.netas30 != null) {
    if (p.netas30 > 0) return false;
    // Y más de N días publicada (la fecha de publicación en Dropi; si no se sabe, la de su primera venta).
    return !!p.publicadaDesde && dias(p.publicadaDesde, hoy) > n;
  }
  // Vendió hace menos de N días: no.
  if (p.ultimaVenta && dias(p.ultimaVenta, hoy) < n) return false;
  // Nunca vendió: solo si ya lleva N días publicada (si no se sabe desde cuándo, no).
  if (!p.ultimaVenta && (!p.publicadaDesde || dias(p.publicadaDesde, hoy) < n)) return false;
  return true;
}
