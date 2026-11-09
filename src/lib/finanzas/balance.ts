// Portal AF4 360° › Balance general (mejora 25, migración 0930). Lógica pura: arma activo, pasivo y patrimonio de cada
// mes de corte con lo que ya calcula el portal (caja del flujo, cartera, bienes de uso, inventario, aportes, utilidades y
// retiros) más las partidas manuales, y deja a la vista la «diferencia por cuadrar». Prueba en `balance.test.ts`.

import type { FilaAF4 } from "@/lib/af4/tabla-financiera";

export type RubroPartida = "prestamo" | "otro_activo" | "otro_pasivo" | "aporte_capital" | "patrimonio_inicial";

export const RUBROS_PARTIDA: { clave: RubroPartida; etiqueta: string }[] = [
  { clave: "prestamo", etiqueta: "Préstamo" },
  { clave: "otro_activo", etiqueta: "Otro activo" },
  { clave: "otro_pasivo", etiqueta: "Otro pasivo" },
  { clave: "aporte_capital", etiqueta: "Aporte de capital" },
  { clave: "patrimonio_inicial", etiqueta: "Patrimonio inicial" },
];

export const esRubroPartida = (v: unknown): v is RubroPartida => RUBROS_PARTIDA.some((r) => r.clave === v);
export const etiquetaRubro = (r: string) => RUBROS_PARTIDA.find((x) => x.clave === r)?.etiqueta ?? r;

export interface Partida {
  id?: string;
  entidad_id: string | null;
  rubro: RubroPartida;
  concepto: string;
  /** AAAA-MM-01: vale desde el cierre de este mes. */
  periodo: string;
  monto: number;
}

/**
 * Las partidas vigentes al cierre de `corte`: de cada concepto (entidad, rubro y nombre), la última con mes ≤ corte. Un
 * saldo en cero cierra el concepto (un préstamo pagado) y no se devuelve.
 */
export function partidasVigentes(partidas: Partida[], corte: string): Partida[] {
  const ultima = new Map<string, Partida>();
  for (const p of partidas) {
    if (p.periodo > corte) continue;
    const k = `${p.entidad_id ?? ""}|${p.rubro}|${p.concepto.trim().toLowerCase()}`;
    const previa = ultima.get(k);
    if (!previa || p.periodo > previa.periodo) ultima.set(k, p);
  }
  return [...ultima.values()].filter((p) => Math.abs(p.monto) >= 0.005).sort((a, b) => a.concepto.localeCompare(b.concepto));
}

/** Lo que entra al balance de un mes de corte. Todo en la misma moneda. */
export interface InsumosBalance {
  /** Cuentas de caja, banco y billetera con su saldo al cierre. */
  caja: { id: string; nombre: string; saldo: number }[];
  /** Saldo de las tarjetas de crédito (negativo = lo que se debe). */
  tarjetas: number;
  /** null = no se pudo leer la cartera. */
  cxc: number | null;
  cxp: number | null;
  bienesCosto: number;
  bienesDepreciacion: number;
  /** null = sin foto del inventario de ese mes. */
  inventario: number | null;
  /** Las partidas vigentes (`partidasVigentes`). */
  partidas: Partida[];
  /** Aportes de capital del libro, acumulados hasta el corte. */
  aportesLibro: number;
  /** Resultado del EERR acumulado hasta el corte, sin restar los retiros de dividendos. */
  utilidadAcumulada: number;
  /** Retiros de los socios acumulados (positivo). */
  retiros: number;
  /** Préstamos y líneas de crédito de Tesorería › Deuda al corte (`fin_deuda_al`). */
  deuda?: LineaDeuda[];
  /** Anticipos a proveedores: compras pagadas cuya mercancía no había llegado (`fin_anticipos_proveedores_al`). */
  anticipos?: number;
  /** Gastos de importación sin pagar de compras que ya llegaron (`fin_compras_gastos`). */
  gastosImportacion?: number;
}

export interface LineaDeuda {
  id: string;
  nombre: string;
  saldo: number;
  /** Lo que vence en los 12 meses siguientes. */
  corriente: number;
}

const normalizar = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Las partidas manuales quedan solo para lo que no sale de ningún módulo: un préstamo cargado a mano con el mismo nombre
 * que uno de Tesorería › Deuda se descarta (si no, contaría dos veces).
 */
export function partidasSinDuplicar(partidas: Partida[], nombresDeuda: string[]): Partida[] {
  if (!nombresDeuda.length) return partidas;
  const deuda = new Set(nombresDeuda.map(normalizar));
  return partidas.filter((p) => p.rubro !== "prestamo" || !deuda.has(normalizar(p.concepto)));
}

/**
 * Gastos de importación por pagar al corte: los de compras que ya llegaron (su costo ya es inventario) y que no se habían
 * pagado a esa fecha (sin pagar, o pagados con fecha posterior). Los de compras que no llegaron no son pasivo todavía.
 */
export function gastosImportacionAl(gastos: { monto: number; pagado: boolean; fecha: string | null; llegada: string | null }[], corte: string): number {
  return r2(
    gastos
      .filter((g) => g.llegada !== null && g.llegada <= corte && (!g.pagado || (g.fecha !== null && g.fecha > corte)))
      .reduce((a, g) => a + g.monto, 0),
  );
}

export interface Balance {
  filas: FilaAF4[];
  activo: number[];
  pasivo: number[];
  patrimonio: number[];
  diferencia: number[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** El balance de cada corte (una columna por mes, en el orden de `cortes`). */
export function armarBalance(cortes: string[], insumos: Record<string, InsumosBalance>): Balance {
  const de = (m: string) => insumos[m];
  const col = (f: (i: InsumosBalance) => number | null) => cortes.map((m) => (de(m) ? f(de(m)) : null));
  const num = (v: number | null) => v ?? 0;
  const sumaPartidas = (i: InsumosBalance, rubro: RubroPartida) => i.partidas.filter((p) => p.rubro === rubro).reduce((a, p) => a + p.monto, 0);

  const filas: FilaAF4[] = [];
  const seccion = (clave: string, etiqueta: string, valores: (number | null)[]) => filas.push({ clave, etiqueta, tipo: "seccion", valores, total: null });
  const detalle = (clave: string, etiqueta: string, valores: (number | null)[], padre: string) =>
    filas.push({ clave, etiqueta, tipo: "detalle", valores, total: null, padre });
  // Una línea por cada nombre que aparece en algún corte (cuenta o partida).
  const detallesDe = (padre: string, nombres: Map<string, string>, valor: (i: InsumosBalance, clave: string) => number, prefijo = padre) => {
    for (const [clave, etiqueta] of nombres) detalle(`${prefijo}-${clave}`, etiqueta, col((i) => r2(valor(i, clave))), padre);
  };

  // ---- Activo
  const caja = col((i) => r2(i.caja.reduce((a, c) => a + c.saldo, 0)));
  const cxc = col((i) => i.cxc);
  const inventario = col((i) => i.inventario);
  const bienes = col((i) => r2(i.bienesCosto - i.bienesDepreciacion));
  const anticipos = col((i) => r2(i.anticipos ?? 0));
  const otrosActivos = col((i) => r2(sumaPartidas(i, "otro_activo")));
  const activo = cortes.map((_, k) => r2(num(caja[k]) + num(cxc[k]) + num(inventario[k]) + num(anticipos[k]) + num(bienes[k]) + num(otrosActivos[k])));

  filas.push({ clave: "g-activo", etiqueta: "Activo", tipo: "grupo", valores: cortes.map(() => null), total: null });
  seccion("caja", "Caja y bancos", caja);
  const cuentas = new Map<string, string>();
  for (const m of cortes) for (const c of de(m)?.caja ?? []) cuentas.set(c.id, c.nombre);
  detallesDe("caja", cuentas, (i, id) => i.caja.find((c) => c.id === id)?.saldo ?? 0);
  seccion("cxc", "Cuentas por cobrar", cxc);
  seccion("inventario", "Inventario", inventario);
  if (anticipos.some((v) => num(v) !== 0)) seccion("anticipos", "Anticipos a proveedores", anticipos);
  seccion("bienes", "Bienes de uso netos", bienes);
  detalle("bienes-costo", "Costo de los bienes", col((i) => r2(i.bienesCosto)), "bienes");
  detalle("bienes-dep", "Depreciación acumulada", col((i) => r2(-i.bienesDepreciacion)), "bienes");
  const nombresPartida = (rubro: RubroPartida) => {
    const n = new Map<string, string>();
    for (const m of cortes) for (const p of de(m)?.partidas ?? []) if (p.rubro === rubro) n.set(p.concepto.trim().toLowerCase(), p.concepto.trim());
    return n;
  };
  const valorPartida = (rubro: RubroPartida) => (i: InsumosBalance, clave: string) =>
    i.partidas.filter((p) => p.rubro === rubro && p.concepto.trim().toLowerCase() === clave).reduce((a, p) => a + p.monto, 0);
  if (otrosActivos.some((v) => num(v) !== 0)) {
    seccion("otros-activos", "Otros activos", otrosActivos);
    detallesDe("otros-activos", nombresPartida("otro_activo"), valorPartida("otro_activo"));
  }
  filas.push({ clave: "total-activo", etiqueta: "Total activo", tipo: "subtotal", valores: activo, total: null });

  // ---- Pasivo
  const cxp = col((i) => i.cxp);
  const tarjetas = col((i) => r2(-i.tarjetas));
  const gastosImp = col((i) => r2(i.gastosImportacion ?? 0));
  const sumaDeuda = (i: InsumosBalance) => (i.deuda ?? []).reduce((a, d) => a + d.saldo, 0);
  const prestamos = col((i) => r2(sumaDeuda(i) + sumaPartidas(i, "prestamo")));
  const otrosPasivos = col((i) => r2(sumaPartidas(i, "otro_pasivo")));
  const pasivo = cortes.map((_, k) => r2(num(cxp[k]) + num(gastosImp[k]) + num(tarjetas[k]) + num(prestamos[k]) + num(otrosPasivos[k])));
  filas.push({ clave: "g-pasivo", etiqueta: "Pasivo", tipo: "grupo", valores: cortes.map(() => null), total: null });
  seccion("cxp", "Cuentas por pagar", cxp);
  if (gastosImp.some((v) => num(v) !== 0)) seccion("gastos-importacion", "Gastos de importación por pagar", gastosImp);
  if (tarjetas.some((v) => num(v) !== 0)) seccion("tarjetas", "Tarjetas de crédito", tarjetas);
  seccion("prestamos", "Préstamos y líneas de crédito", prestamos);
  const lineasDeuda = new Map<string, string>();
  for (const m of cortes) for (const d of de(m)?.deuda ?? []) lineasDeuda.set(d.id, d.nombre);
  detallesDe("prestamos", lineasDeuda, (i, id) => i.deuda?.find((d) => d.id === id)?.saldo ?? 0, "prestamos-deuda");
  if (lineasDeuda.size) {
    const corriente = col((i) => r2((i.deuda ?? []).reduce((a, d) => a + d.corriente, 0)));
    detalle("prestamos-corriente", "De ella, vence en 12 meses", corriente, "prestamos");
  }
  detallesDe("prestamos", nombresPartida("prestamo"), valorPartida("prestamo"));
  if (otrosPasivos.some((v) => num(v) !== 0)) {
    seccion("otros-pasivos", "Otros pasivos", otrosPasivos);
    detallesDe("otros-pasivos", nombresPartida("otro_pasivo"), valorPartida("otro_pasivo"));
  }
  filas.push({ clave: "total-pasivo", etiqueta: "Total pasivo", tipo: "subtotal", valores: pasivo, total: null });

  // ---- Patrimonio
  const inicial = col((i) => r2(sumaPartidas(i, "patrimonio_inicial")));
  const aportes = col((i) => r2(i.aportesLibro + sumaPartidas(i, "aporte_capital")));
  const utilidades = col((i) => r2(i.utilidadAcumulada));
  const retiros = col((i) => r2(-i.retiros));
  const patrimonio = cortes.map((_, k) => r2(num(inicial[k]) + num(aportes[k]) + num(utilidades[k]) + num(retiros[k])));
  filas.push({ clave: "g-patrimonio", etiqueta: "Patrimonio", tipo: "grupo", valores: cortes.map(() => null), total: null });
  if (inicial.some((v) => num(v) !== 0)) seccion("patrimonio-inicial", "Patrimonio inicial", inicial);
  seccion("aportes", "Aportes de capital", aportes);
  seccion("utilidades", "Utilidades acumuladas", utilidades);
  seccion("retiros", "Retiros de socios", retiros);
  filas.push({ clave: "total-patrimonio", etiqueta: "Total patrimonio", tipo: "subtotal", valores: patrimonio, total: null });

  const pasivoPatrimonio = cortes.map((_, k) => r2(pasivo[k] + patrimonio[k]));
  filas.push({ clave: "pasivo-patrimonio", etiqueta: "Pasivo + patrimonio", tipo: "subtotal", valores: pasivoPatrimonio, total: null });
  const diferencia = cortes.map((_, k) => r2(activo[k] - pasivoPatrimonio[k]));
  filas.push({ clave: "diferencia", etiqueta: "Diferencia por cuadrar", tipo: "total", valores: diferencia, total: null });
  return { filas, activo, pasivo, patrimonio, diferencia };
}

/** El valor de los bienes al cierre de un mes, de las situaciones de cada bien (costo de los que siguen y su depreciación). */
export function bienesAlCorte(bienes: { importe: number; neto: number; deBaja: boolean }[]): { costo: number; depreciacion: number } {
  const vivos = bienes.filter((b) => !b.deBaja);
  const costo = vivos.reduce((a, b) => a + b.importe, 0);
  return { costo: r2(costo), depreciacion: r2(costo - vivos.reduce((a, b) => a + b.neto, 0)) };
}
