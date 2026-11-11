// QuickBooks Online: lectura pura de lo que devuelve la API v3 (solo lectura). El reporte ProfitAndLoss resumido por mes (o
// por clase) a filas `{ columna, cuenta, grupo, monto }`, las consultas de Account / Class / Department y la suma por mes de
// SalesReceipt, Invoice, RefundReceipt y CreditMemo, con la paginación de las consultas (STARTPOSITION / MAXRESULTS).
// Prueba en `reportes.test.ts` con respuestas inventadas.

export type GrupoPyg = "Income" | "COGS" | "Expense" | "OtherIncome" | "OtherExpense";

const GRUPOS: Record<string, GrupoPyg> = {
  Income: "Income",
  COGS: "COGS",
  CostOfGoodsSold: "COGS",
  Expenses: "Expense",
  Expense: "Expense",
  OtherIncome: "OtherIncome",
  OtherExpenses: "OtherExpense",
  OtherExpense: "OtherExpense",
};

export interface ColumnaReporte {
  /** Mes («AAAA-MM-01») en el reporte por mes; el id (o el nombre) de la clase en el reporte por clase. */
  clave: string;
  titulo: string;
  indice: number;
}

export interface FilaPyg {
  columna: string;
  cuentaId: string;
  cuentaNombre: string;
  grupo: GrupoPyg;
  monto: number;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Un número del reporte («1,234.56», «-12.00», «» = 0). */
export function montoReporte(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string" || !v.trim()) return 0;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Las columnas de importes del reporte (sin la de cuentas ni el «Total»). */
export function columnasReporte(reporte: unknown, modo: "mes" | "clase"): ColumnaReporte[] {
  const cols = arr(obj(obj(reporte).Columns).Column);
  const salida: ColumnaReporte[] = [];
  cols.forEach((c, indice) => {
    const o = obj(c);
    if (o.ColType !== "Money") return;
    const titulo = String(o.ColTitle ?? "");
    const meta = new Map(arr(o.MetaData).map((m) => [String(obj(m).Name ?? ""), String(obj(m).Value ?? "")]));
    if (/^total$/i.test(titulo.trim()) || meta.get("ColKey") === "total") return;
    if (modo === "mes") {
      const inicio = meta.get("StartDate") ?? "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(inicio)) salida.push({ clave: `${inicio.slice(0, 7)}-01`, titulo, indice });
    } else {
      const clave = meta.get("ColKey") || titulo.trim();
      if (clave) salida.push({ clave, titulo: titulo.trim() || clave, indice });
    }
  });
  return salida;
}

/** Las filas de datos (cuentas) del reporte, con el grupo de su sección superior. */
export function filasPyg(reporte: unknown, modo: "mes" | "clase"): FilaPyg[] {
  const columnas = columnasReporte(reporte, modo);
  const salida: FilaPyg[] = [];
  const recorrer = (filas: unknown[], grupo: GrupoPyg | null) => {
    for (const f of filas) {
      const o = obj(f);
      const g = grupo ?? GRUPOS[String(o.group ?? "")] ?? null;
      if (o.type === "Section" || o.Rows) {
        recorrer(arr(obj(o.Rows).Row), g);
        continue;
      }
      if (!g) continue;
      const datos = arr(o.ColData).map(obj);
      const primera = datos[0] ?? {};
      const nombre = String(primera.value ?? "").trim();
      if (!nombre) continue;
      const id = typeof primera.id === "string" && primera.id ? primera.id : `nombre:${nombre.slice(0, 180)}`;
      for (const c of columnas) {
        const monto = r2(montoReporte(datos[c.indice]?.value));
        if (monto !== 0) salida.push({ columna: c.clave, cuentaId: id, cuentaNombre: nombre.slice(0, 300), grupo: g, monto });
      }
    }
  };
  recorrer(arr(obj(obj(reporte).Rows).Row), null);
  return salida;
}

// ---------------------------------------------------------------------------------------------------------------------
// Consultas (query) y paginación
// ---------------------------------------------------------------------------------------------------------------------
export const TAMANO_PAGINA = 1000;

/** El texto de una consulta paginada. `entidad` y `donde` son fijos del código (nunca texto de una persona). */
export function consultaPaginada(entidad: string, donde: string, inicio: number, columnas = "*"): string {
  return `select ${columnas} from ${entidad}${donde ? ` where ${donde}` : ""} startposition ${inicio} maxresults ${TAMANO_PAGINA}`;
}

/** La posición de la página siguiente, o null si esta fue la última. */
export const siguienteInicio = (inicio: number, recibidos: number): number | null => (recibidos >= TAMANO_PAGINA ? inicio + recibidos : null);

/** Las filas de una entidad en la respuesta de una consulta. */
export const filasConsulta = (respuesta: unknown, entidad: string): Obj[] => arr(obj(obj(respuesta).QueryResponse)[entidad]).map(obj);

export interface CuentaQbo {
  id: string;
  nombre: string;
  nombreCompleto: string | null;
  tipo: string | null;
  subtipo: string | null;
  clasificacion: string | null;
  activa: boolean;
}

export function cuentaDeQbo(a: Obj): CuentaQbo | null {
  const id = typeof a.Id === "string" ? a.Id : null;
  const nombre = typeof a.Name === "string" ? a.Name.trim() : "";
  if (!id || !nombre) return null;
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);
  return { id, nombre: nombre.slice(0, 300), nombreCompleto: t(a.FullyQualifiedName), tipo: t(a.AccountType), subtipo: t(a.AccountSubType), clasificacion: t(a.Classification), activa: a.Active !== false };
}

export function claseDeQbo(a: Obj): { id: string; nombre: string; activa: boolean } | null {
  const id = typeof a.Id === "string" ? a.Id : null;
  const nombre = typeof a.FullyQualifiedName === "string" ? a.FullyQualifiedName : typeof a.Name === "string" ? a.Name : "";
  return id && nombre.trim() ? { id, nombre: nombre.trim().slice(0, 300), activa: a.Active !== false } : null;
}

export const TIPOS_VENTA = ["SalesReceipt", "Invoice", "RefundReceipt", "CreditMemo"] as const;
export type TipoVenta = (typeof TIPOS_VENTA)[number];
/** Lo que resta de las ventas (devoluciones y notas de crédito). */
export const RESTA_VENTAS = new Set<TipoVenta>(["RefundReceipt", "CreditMemo"]);

/** Suma por mes los documentos (TxnDate + TotalAmt). */
export function sumarVentasPorMes(docs: Obj[]): Map<string, { documentos: number; total: number }> {
  const m = new Map<string, { documentos: number; total: number }>();
  for (const d of docs) {
    const fecha = typeof d.TxnDate === "string" ? d.TxnDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const k = `${fecha.slice(0, 7)}-01`;
    const x = m.get(k) ?? { documentos: 0, total: 0 };
    x.documentos++;
    x.total = r2(x.total + montoReporte(d.TotalAmt));
    m.set(k, x);
  }
  return m;
}

/** La primera y la última fecha de un rango de meses (para el reporte y las consultas). */
export function rangoFechas(meses: string[]): { desde: string; hasta: string } {
  const orden = [...meses].sort();
  const ult = orden[orden.length - 1];
  const [a, mm] = ult.split("-").map(Number);
  const dias = new Date(Date.UTC(a, mm, 0)).getUTCDate();
  return { desde: orden[0], hasta: `${ult.slice(0, 7)}-${String(dias).padStart(2, "0")}` };
}
