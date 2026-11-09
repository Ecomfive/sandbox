// Portal AF4 360° › Flujo de caja por método indirecto (mejora 26). Lógica pura: parte de la utilidad neta del EERR y la
// lleva al flujo operativo con los ajustes que no mueven caja (depreciación, retiros de dividendos, altas de bienes de
// uso cargadas como gasto) y las variaciones del capital de trabajo (cuentas por cobrar, por pagar e inventario). La
// diferencia contra el flujo operativo directo queda a la vista. Prueba en `flujo-indirecto.test.ts`.

import type { FilaAF4 } from "@/lib/af4/tabla-financiera";
import { moverMes } from "./eerr-analisis";

type PorMes = Record<string, number>;
/** Saldo al cierre de cada mes (null = no se sabe). Debe traer también el mes anterior al primero. */
type SaldoMes = Record<string, number | null | undefined>;

export interface InsumosIndirecto {
  meses: string[];
  utilidad: PorMes;
  depreciacion: PorMes;
  dividendos: PorMes;
  altasBienes: PorMes;
  cxc: SaldoMes;
  cxp: SaldoMes;
  inventario: SaldoMes;
  operativoDirecto: PorMes;
}

export interface FlujoIndirecto {
  filas: FilaAF4[];
  indirecto: PorMes;
  diferencia: PorMes;
  /** Meses sin la variación de inventario (falta la foto de ese mes o del anterior). */
  sinInventario: string[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Lo que cambió un saldo en el mes (cierre − cierre del mes anterior), o null si falta alguno. */
export function variacionSaldo(saldos: SaldoMes, mes: string): number | null {
  const a = saldos[mes];
  const b = saldos[moverMes(mes, -1)];
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return r2(a - b);
}

export function flujoIndirecto(i: InsumosIndirecto): FlujoIndirecto {
  const { meses } = i;
  const v = (pm: PorMes) => meses.map((m) => r2(pm[m] ?? 0));
  const varCxc = meses.map((m) => -(variacionSaldo(i.cxc, m) ?? 0));
  const varCxp = meses.map((m) => variacionSaldo(i.cxp, m) ?? 0);
  const sinInventario = meses.filter((m) => variacionSaldo(i.inventario, m) === null);
  const varInv = meses.map((m) => -(variacionSaldo(i.inventario, m) ?? 0));
  const dep = v(i.depreciacion);
  const div = v(i.dividendos);
  const altas = v(i.altasBienes);
  const ajustes = meses.map((_, k) => r2(dep[k] + div[k] + altas[k] + varCxc[k] + varCxp[k] + varInv[k]));
  const utilidad = v(i.utilidad);
  const indirectoArr = meses.map((_, k) => r2(utilidad[k] + ajustes[k]));
  const directo = v(i.operativoDirecto);
  const diferenciaArr = meses.map((_, k) => r2(directo[k] - indirectoArr[k]));

  const filas: FilaAF4[] = [
    { clave: "utilidad", etiqueta: "Utilidad neta", tipo: "subtotal", valores: utilidad },
    { clave: "ajustes", etiqueta: "Ajustes", tipo: "seccion", valores: ajustes },
    { clave: "ajuste-dep", etiqueta: "Depreciación", tipo: "detalle", valores: dep, padre: "ajustes" },
    { clave: "ajuste-div", etiqueta: "Retiros de dividendos", tipo: "detalle", valores: div, padre: "ajustes" },
    { clave: "ajuste-altas", etiqueta: "Altas de bienes de uso en el EERR", tipo: "detalle", valores: altas, padre: "ajustes" },
    { clave: "ajuste-cxc", etiqueta: "Variación de cuentas por cobrar", tipo: "detalle", valores: varCxc, padre: "ajustes" },
    { clave: "ajuste-cxp", etiqueta: "Variación de cuentas por pagar", tipo: "detalle", valores: varCxp, padre: "ajustes" },
    { clave: "ajuste-inv", etiqueta: "Variación de inventario", tipo: "detalle", valores: varInv, padre: "ajustes" },
    { clave: "indirecto", etiqueta: "Flujo operativo (método indirecto)", tipo: "subtotal", valores: indirectoArr },
    { clave: "directo", etiqueta: "Flujo operativo (método directo)", tipo: "subtotal", valores: directo },
    { clave: "diferencia", etiqueta: "Diferencia por conciliar", tipo: "total", valores: diferenciaArr },
  ];
  return {
    filas,
    indirecto: Object.fromEntries(meses.map((m, k) => [m, indirectoArr[k]])),
    diferencia: Object.fromEntries(meses.map((m, k) => [m, diferenciaArr[k]])),
    sinInventario,
  };
}
