// «Salud de datos» del Portal AF4: qué tan completos y confiables están los datos, cada indicador con su estado y el
// enlace a donde se resuelve. Lógica pura (recibe los conteos). Prueba en `salud-datos.test.ts`.

export type EstadoSalud = "bien" | "atencion" | "problema";

export interface IndicadorSalud {
  id: string;
  titulo: string;
  /** El valor que se muestra («96 %», «3»). */
  valor: string;
  estado: EstadoSalud;
  detalle: string;
  href: string;
  /** Lo que hay que hacer, en el enlace («Clasificar»). */
  accion: string;
}

export interface TablaCritica {
  nombre: string;
  filas: number | null;
  href: string;
  accion: string;
}

export interface EntradaSalud {
  movimientos: number;
  sinTipo: number;
  sinTienda: number;
  /** Sin tipo o sin tienda (cada movimiento cuenta una vez). */
  pendientes: number;
  lineasBanco: number | null;
  lineasResueltas: number | null;
  /** Meses con movimientos («AAAA-MM-01») y los cerrados. */
  mesesConMovimientos: string[];
  mesesCerrados: string[];
  /** El mes de hoy («AAAA-MM-01»): el mes en curso no cuenta como «sin cerrar». */
  mesActual: string;
  duplicados: number;
  atipicos: number;
  sinTasa: number | null;
  tablas: TablaCritica[];
  importacionesFallidas: number | null;
}

const pct = (n: number, de: number) => (de ? Math.round((1000 * n) / de) / 10 : 100);
const fmtPct = (v: number) => `${v.toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`;
const nombreMes = (p: string) => {
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(p.slice(5, 7)) - 1];
  return `${m} ${p.slice(2, 4)}`;
};

/** Los meses pasados con movimientos que no están cerrados, del más viejo al más nuevo. */
export function mesesSinCerrar(conMovimientos: string[], cerrados: string[], mesActual: string): string[] {
  const c = new Set(cerrados.map((x) => x.slice(0, 10)));
  return [...new Set(conMovimientos.map((x) => x.slice(0, 10)))].filter((m) => m < mesActual && !c.has(m)).sort();
}

/** Los indicadores, en el orden en que se muestran. */
export function indicadoresSalud(e: EntradaSalud): IndicadorSalud[] {
  const clasificados = Math.max(0, e.movimientos - e.pendientes);
  const pClas = pct(clasificados, e.movimientos);
  const salida: IndicadorSalud[] = [
    {
      id: "clasificado",
      titulo: "Libro clasificado",
      valor: fmtPct(pClas),
      estado: pClas >= 98 ? "bien" : pClas >= 90 ? "atencion" : "problema",
      detalle: `${e.sinTipo.toLocaleString("es-PA")} sin tipo · ${e.sinTienda.toLocaleString("es-PA")} sin tienda`,
      href: "/libro-movimientos/pendientes",
      accion: "Clasificar",
    },
  ];
  if (e.lineasBanco !== null && e.lineasResueltas !== null) {
    const p = pct(e.lineasResueltas, e.lineasBanco);
    salida.push({
      id: "conciliado",
      titulo: "Banco conciliado",
      valor: e.lineasBanco ? fmtPct(p) : "—",
      estado: !e.lineasBanco ? "atencion" : p >= 95 ? "bien" : p >= 80 ? "atencion" : "problema",
      detalle: e.lineasBanco ? `${(e.lineasBanco - e.lineasResueltas).toLocaleString("es-PA")} líneas pendientes` : "Sin extractos cargados",
      href: "/conciliacion-bancaria",
      accion: "Conciliar",
    });
  }
  const abiertos = mesesSinCerrar(e.mesesConMovimientos, e.mesesCerrados, e.mesActual);
  salida.push({
    id: "cierres",
    titulo: "Meses sin cerrar",
    valor: abiertos.length.toLocaleString("es-PA"),
    estado: abiertos.length === 0 ? "bien" : abiertos.length <= 1 ? "atencion" : "problema",
    detalle: abiertos.length ? abiertos.slice(-4).map(nombreMes).join(", ") + (abiertos.length > 4 ? "…" : "") : "Todo cerrado",
    href: "/cierre-mes",
    accion: "Cerrar",
  });
  salida.push({
    id: "duplicados",
    titulo: "Posibles duplicados",
    valor: e.duplicados.toLocaleString("es-PA"),
    estado: e.duplicados === 0 ? "bien" : e.duplicados <= 5 ? "atencion" : "problema",
    detalle: "Mismo monto, ±3 días, descripción parecida",
    href: "/libro-movimientos/revisar",
    accion: "Revisar",
  });
  salida.push({
    id: "atipicos",
    titulo: "Montos atípicos",
    valor: e.atipicos.toLocaleString("es-PA"),
    estado: e.atipicos === 0 ? "bien" : e.atipicos <= 10 ? "atencion" : "problema",
    detalle: "Más de 3× la mediana de su tipo",
    href: "/libro-movimientos/revisar",
    accion: "Revisar",
  });
  if (e.sinTasa !== null) {
    salida.push({
      id: "tasa",
      titulo: "Movimientos sin tasa",
      valor: e.sinTasa.toLocaleString("es-PA"),
      estado: e.sinTasa === 0 ? "bien" : "problema",
      detalle: "En otra moneda sin el tipo de cambio de su mes: quedan en 0 USD",
      href: "/estado-resultados/tipos-cambio",
      accion: "Cargar tasas",
    });
  }
  const vacias = e.tablas.filter((t) => t.filas === 0);
  salida.push({
    id: "tablas",
    titulo: "Tablas críticas vacías",
    valor: vacias.length.toLocaleString("es-PA"),
    estado: vacias.length === 0 ? "bien" : vacias.length <= 1 ? "atencion" : "problema",
    detalle: vacias.length ? vacias.map((t) => t.nombre).join(", ") : "Todas tienen datos",
    href: vacias[0]?.href ?? "/importar",
    accion: vacias[0]?.accion ?? "Importar",
  });
  if (e.importacionesFallidas !== null) {
    salida.push({
      id: "importaciones",
      titulo: "Importaciones con error",
      valor: e.importacionesFallidas.toLocaleString("es-PA"),
      estado: e.importacionesFallidas === 0 ? "bien" : "atencion",
      detalle: "Últimos 30 días",
      href: "/importar/historial",
      accion: "Ver historial",
    });
  }
  return salida;
}

/** Cuántos indicadores están bien, de cuántos (para el titular de la página). */
export const resumenSalud = (xs: IndicadorSalud[]) => ({ bien: xs.filter((x) => x.estado === "bien").length, total: xs.length, problemas: xs.filter((x) => x.estado === "problema").length });
