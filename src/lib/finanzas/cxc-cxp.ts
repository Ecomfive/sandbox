// Portal AF4 360° › Cuentas por cobrar y Cuentas por pagar (migración 0905). Lógica pura: saldo, estado, antigüedad,
// vencimiento, totales y concentración de una cartera de documentos con sus abonos, y la validación de lo que llega del
// navegador al importar el Excel. La misma regla vive en SQL (`fin_cartera_saldos`, `fin_cartera_al`): si cambias una,
// cambia la otra. Sirve en el servidor y en el cliente. Prueba en `cxc-cxp.test.ts`.

export type Clase = "cobrar" | "pagar";
export const CLASES: Clase[] = ["cobrar", "pagar"];

/** El módulo de permisos de cada cartera. */
export const MODULO_DE_CLASE: Record<Clase, string> = {
  cobrar: "cuentas-por-cobrar",
  pagar: "cuentas-por-pagar",
};

export const RUTA_DE_CLASE: Record<Clase, string> = {
  cobrar: "/cuentas-por-cobrar",
  pagar: "/cuentas-por-pagar",
};

/** Lo que se marca a mano: el documento sale de la cartera viva aunque tenga saldo. */
export type EstadoManual = "incobrable" | "anulado";
export const ESTADOS_MANUALES: EstadoManual[] = ["incobrable", "anulado"];

export type Estado = "pendiente" | "parcial" | "pagado" | EstadoManual;

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagado: "Pagado",
  incobrable: "Incobrable",
  anulado: "Anulado",
};

/** Estados que siguen vivos (cuentan en el total por cobrar o por pagar). */
export const ESTADOS_ABIERTOS: Estado[] = ["pendiente", "parcial"];

/** Días que se dan por plazo cuando el documento no trae vencimiento (decisión a confirmar con finanzas). */
export const PLAZO_PREDETERMINADO = 30;

/** Por debajo de medio centavo un saldo es cero. */
const CENTAVO = 0.005;

export type Tramo = "0-30" | "31-60" | "61-90" | "90+" | "sin-fecha";

export const TRAMOS: { clave: Tramo; etiqueta: string }[] = [
  { clave: "0-30", etiqueta: "0–30 días" },
  { clave: "31-60", etiqueta: "31–60 días" },
  { clave: "61-90", etiqueta: "61–90 días" },
  { clave: "90+", etiqueta: "Más de 90 días" },
  { clave: "sin-fecha", etiqueta: "Sin fecha" },
];

export const ETIQUETA_TRAMO: Record<Tramo, string> = Object.fromEntries(TRAMOS.map((t) => [t.clave, t.etiqueta])) as Record<Tramo, string>;

export interface AbonoBase {
  fecha: string | null;
  monto: number;
}

export interface DocumentoBase {
  monto: number;
  fecha: string | null;
  vencimiento: string | null;
  estado_manual: EstadoManual | null;
  abonos: AbonoBase[];
}

export const redondear = (n: number) => Math.round(n * 100) / 100;

export function abonadoDe(doc: Pick<DocumentoBase, "abonos">): number {
  return redondear(doc.abonos.reduce((a, b) => a + b.monto, 0));
}

/** Monto − abonos. Puede quedar negativo si se abonó de más (queda «Pagado» y se ve en rojo). */
export function saldoDe(doc: Pick<DocumentoBase, "monto" | "abonos">): number {
  return redondear(doc.monto - abonadoDe(doc));
}

/** El estado sale del saldo, salvo «incobrable» o «anulado», que se marcan a mano. */
export function estadoDe(doc: DocumentoBase): Estado {
  if (doc.estado_manual) return doc.estado_manual;
  const saldo = saldoDe(doc);
  if (saldo <= CENTAVO) return "pagado";
  return abonadoDe(doc) > CENTAVO ? "parcial" : "pendiente";
}

const DIA = 86_400_000;
const aUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Días entre dos fechas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((aUtc(b) - aUtc(a)) / DIA);
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aUtc(iso) + dias * DIA).toISOString().slice(0, 10);
}

/** «Hoy» en Panamá, AAAA-MM-DD. */
import { hoyPanama } from "@/lib/af4/fecha";
export { hoyPanama };

/** Días desde la emisión (la antigüedad del documento); null sin fecha. Una fecha futura cuenta 0. */
export function antiguedad(fecha: string | null, hoy: string): number | null {
  return fecha ? Math.max(0, diasEntre(fecha, hoy)) : null;
}

export function tramoDe(dias: number | null): Tramo {
  if (dias === null) return "sin-fecha";
  if (dias <= 30) return "0-30";
  if (dias <= 60) return "31-60";
  if (dias <= 90) return "61-90";
  return "90+";
}

/** El vencimiento que vale: el del documento o, si no trae, la emisión + el plazo predeterminado. */
export function vencimientoEfectivo(doc: Pick<DocumentoBase, "fecha" | "vencimiento">, plazo = PLAZO_PREDETERMINADO): string | null {
  return doc.vencimiento ?? (doc.fecha ? sumarDias(doc.fecha, plazo) : null);
}

/** Vencido: sigue abierto y su vencimiento ya pasó. */
export function estaVencido(doc: DocumentoBase, hoy: string): boolean {
  if (!ESTADOS_ABIERTOS.includes(estadoDe(doc))) return false;
  const v = vencimientoEfectivo(doc);
  return v !== null && v < hoy;
}

/** Días de atraso (0 si no está vencido). */
export function diasVencido(doc: DocumentoBase, hoy: string): number {
  const v = vencimientoEfectivo(doc);
  return estaVencido(doc, hoy) && v ? diasEntre(v, hoy) : 0;
}

export interface Concentracion {
  contraparte: string;
  saldo: number;
  /** Parte del total abierto (0–1). */
  parte: number;
  documentos: number;
}

export interface ResumenCartera {
  /** Saldo de lo abierto (pendiente + parcial). */
  total: number;
  documentosAbiertos: number;
  vencido: number;
  documentosVencidos: number;
  /** Saldo abierto por tramo de antigüedad. */
  tramos: Record<Tramo, number>;
  /** Saldo de lo marcado incobrable (no cuenta en el total). */
  incobrable: number;
  /** Las 5 contrapartes con más saldo abierto, de mayor a menor. */
  top: Concentracion[];
  /** Parte del total que suman las 5 primeras (0–1). */
  parteTop: number;
}

/** Totales, antigüedad y concentración de una cartera a la fecha `hoy`. */
export function resumirCartera<D extends DocumentoBase & { contraparte: string }>(docs: D[], hoy: string, top = 5): ResumenCartera {
  const tramos: Record<Tramo, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, "sin-fecha": 0 };
  const porContraparte = new Map<string, { saldo: number; documentos: number }>();
  let total = 0;
  let abiertos = 0;
  let vencido = 0;
  let vencidos = 0;
  let incobrable = 0;
  for (const d of docs) {
    const estado = estadoDe(d);
    const saldo = saldoDe(d);
    if (estado === "incobrable") incobrable += Math.max(saldo, 0);
    if (!ESTADOS_ABIERTOS.includes(estado)) continue;
    total += saldo;
    abiertos++;
    tramos[tramoDe(antiguedad(d.fecha, hoy))] += saldo;
    if (estaVencido(d, hoy)) {
      vencido += saldo;
      vencidos++;
    }
    const clave = d.contraparte.trim() || "(sin nombre)";
    const c = porContraparte.get(clave) ?? { saldo: 0, documentos: 0 };
    c.saldo += saldo;
    c.documentos++;
    porContraparte.set(clave, c);
  }
  const lista = [...porContraparte]
    .map(([contraparte, c]) => ({ contraparte, saldo: redondear(c.saldo), documentos: c.documentos, parte: total > 0 ? c.saldo / total : 0 }))
    .sort((a, b) => b.saldo - a.saldo || a.contraparte.localeCompare(b.contraparte))
    .slice(0, top);
  for (const k of Object.keys(tramos) as Tramo[]) tramos[k] = redondear(tramos[k]);
  return {
    total: redondear(total),
    documentosAbiertos: abiertos,
    vencido: redondear(vencido),
    documentosVencidos: vencidos,
    tramos,
    incobrable: redondear(incobrable),
    top: lista,
    parteTop: lista.reduce((a, c) => a + c.parte, 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Método de pago
// ---------------------------------------------------------------------------------------------

const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Métodos que se ofrecen al registrar un abono. */
export const METODOS = ["Transferencia", "Binance", "Efectivo", "Yappy", "Tarjeta", "Cheque", "Compensación", "Otro"];

/** «TRASNFERENCIA », «transferencia», «TRANSF.» → «Transferencia»; lo que no se reconoce queda como vino (capitalizado). */
export function normalizarMetodo(v: string | null | undefined): string | null {
  const s = sinAcentos(v ?? "");
  if (!s) return null;
  if (/^TRA[NS]{1,2}F|^TRANSFER|^TRASN/.test(s) || s === "ACH") return "Transferencia";
  if (s.startsWith("BINANCE") || s === "USDT") return "Binance";
  if (s.startsWith("EFECTIVO") || s === "CASH") return "Efectivo";
  if (s.startsWith("YAPPY")) return "Yappy";
  if (/^(TDC|TARJETA|VISA|MASTERCARD|AMEX)/.test(s)) return "Tarjeta";
  if (s.startsWith("CHEQUE")) return "Cheque";
  if (s.startsWith("COMPENSA") || s.startsWith("CRUCE")) return "Compensación";
  const limpio = (v ?? "").replace(/\s+/g, " ").trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Validación de lo que llega del navegador al importar
// ---------------------------------------------------------------------------------------------

export interface AbonoImportado {
  fecha: string | null;
  monto: number;
  metodo: string | null;
  referencia: string | null;
  origen_clave: string;
}

export interface DocumentoImportado {
  /** Fila (o filas) del Excel, solo para el informe. */
  fila: number;
  hoja: string;
  clase: Clase;
  contraparte: string;
  /** Nombre de la tienda o unidad (`fin_unidades`), si se sabe. */
  unidad: string | null;
  documento: string | null;
  fecha: string | null;
  motivo: string | null;
  monto: number;
  notas_excel: string | null;
  origen_clave: string;
  abonos: AbonoImportado[];
}

export const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** La huella de un documento o un abono importado: 24 hex + «#» + ordinal (como el libro de movimientos). */
export const CLAVE_IMPORTACION = /^[0-9a-f]{24}#\d{1,5}$/;
export const MAX_ABONOS_POR_DOCUMENTO = 200;
/** Documentos por lote al importar (cada uno con sus abonos): lejos del límite de 1 MB de una Server Action. */
export const TAMANO_LOTE_IMPORTACION = 200;
export const MAX_MONTO = 100_000_000;

const textoMax = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s === "" ? null : s;
};
const fechaValida = (v: unknown): string | null => {
  if (typeof v !== "string" || !FECHA_ISO.test(v)) return null;
  const anio = Number(v.slice(0, 4));
  // El 2026-13-01 o el 2026-02-30 no existen (Date los corre al mes siguiente): se compara la vuelta.
  return anio >= 2000 && anio <= 2100 && new Date(aUtc(v)).toISOString().slice(0, 10) === v ? v : null;
};
const montoValido = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_MONTO ? redondear(n) : null;
};

/** Revisa un documento importado que llega del navegador: no se confía en nada. Devuelve el documento limpio o el motivo. */
export function validarDocumentoImportado(v: unknown, clase: Clase): { ok: true; doc: DocumentoImportado } | { ok: false; motivo: string } {
  if (!v || typeof v !== "object") return { ok: false, motivo: "fila vacía" };
  const d = v as Record<string, unknown>;
  if (d.clase !== clase) return { ok: false, motivo: "cartera equivocada" };
  const contraparte = textoMax(d.contraparte, 160);
  if (!contraparte) return { ok: false, motivo: "sin contraparte" };
  const monto = montoValido(d.monto);
  if (monto === null) return { ok: false, motivo: "monto inválido" };
  if (typeof d.origen_clave !== "string" || !CLAVE_IMPORTACION.test(d.origen_clave)) return { ok: false, motivo: "huella inválida" };
  const abonosCrudos = Array.isArray(d.abonos) ? d.abonos : [];
  if (abonosCrudos.length > MAX_ABONOS_POR_DOCUMENTO) return { ok: false, motivo: "demasiados abonos" };
  const abonos: AbonoImportado[] = [];
  for (const a of abonosCrudos) {
    if (!a || typeof a !== "object") return { ok: false, motivo: "abono inválido" };
    const x = a as Record<string, unknown>;
    const m = montoValido(x.monto);
    if (m === null || typeof x.origen_clave !== "string" || !CLAVE_IMPORTACION.test(x.origen_clave)) return { ok: false, motivo: "abono inválido" };
    abonos.push({ fecha: fechaValida(x.fecha), monto: m, metodo: normalizarMetodo(textoMax(x.metodo, 40)), referencia: textoMax(x.referencia, 120), origen_clave: x.origen_clave });
  }
  return {
    ok: true,
    doc: {
      fila: Number.isInteger(d.fila) ? (d.fila as number) : 0,
      hoja: textoMax(d.hoja, 60) ?? "",
      clase,
      contraparte,
      unidad: textoMax(d.unidad, 80),
      documento: textoMax(d.documento, 80),
      fecha: fechaValida(d.fecha),
      motivo: textoMax(d.motivo, 300),
      monto,
      notas_excel: textoMax(d.notas_excel, 600),
      origen_clave: d.origen_clave,
      abonos,
    },
  };
}

/** Lee el monto de un formulario («1.250,40», «1,250.40», «$ 12»): número positivo o null. */
export function montoDeFormulario(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  let s = v.replace(/[$\s]/g, "");
  if (!s) return null;
  // Con coma y punto, el último que aparece es el decimal.
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= MAX_MONTO ? redondear(n) : null;
}

export { fechaValida };
