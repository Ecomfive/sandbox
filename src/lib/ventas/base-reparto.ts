// La base de reparto del EERR (`fin_base_distribucion`) a partir de las ventas por tienda. Lógica pura: decide qué
// filas se escriben y cuáles se conservan; la acción «Actualizar base de reparto» la aplica. Prueba en
// `base-reparto.test.ts`.
//
// Regla (comprobada contra GASTOS_PANAMA_2026, hoja EERR): «TOTAL ENVÍOS» = todas las órdenes del mes de la tienda
// (también las canceladas) y «ENTREGADOS» = las cobradas. Por eso la base usa `ordenes` y `entregadas` del resumen.
//
// Lo que no se pisa:
// - una fila cargada a mano (origen «manual»): nunca;
// - un mes que ya trae la base de otro origen (la hoja EERR del libro de Excel, con algún envío): ni sus filas ni las
//   tiendas que le faltan (Excel deja fuera a Kenku y Clicksi), salvo que se pida `reemplazarExcel`;
// - un mes en el que falta la base de una unidad que no vende por Shopify (ECOMFIVE: sus envíos son de Dropi): sin
//   `incluirIncompletos` no se escribe, porque repartir solo entre las tiendas de Shopify le quitaría a ECOMFIVE su
//   parte de A DISTRIBUIR.

export const ORIGEN_VENTAS = "ventas";

export interface VentaMes {
  periodo: string;
  unidad_id: string;
  ordenes: number;
  entregadas: number;
}

export interface BaseExistente {
  periodo: string;
  unidad_id: string;
  envios: number;
  entregados: number;
  origen: string;
}

export type Decision = "nueva" | "actualiza" | "igual" | "conserva_manual" | "conserva_excel" | "mes_incompleto";

export interface PasoBase {
  periodo: string;
  unidad_id: string;
  ordenes: number;
  entregadas: number;
  actual: BaseExistente | null;
  decision: Decision;
}

export interface OpcionesBase {
  reemplazarExcel?: boolean;
  incluirIncompletos?: boolean;
}

/**
 * Qué hacer con cada tienda y mes. `otrasUnidades` son las unidades que reciben reparto y no tienen ventas de Shopify
 * (ECOMFIVE): si un mes no tiene base para ninguna de ellas con envíos, el mes queda incompleto.
 */
export function planBaseReparto(
  ventas: VentaMes[],
  existentes: BaseExistente[],
  otrasUnidades: string[],
  opciones: OpcionesBase = {},
): PasoBase[] {
  const actual = new Map(existentes.map((b) => [`${b.periodo}|${b.unidad_id}`, b]));
  const otras = new Set(otrasUnidades);
  const delExcel = new Set(existentes.filter((b) => b.origen !== "manual" && b.origen !== ORIGEN_VENTAS && b.envios > 0).map((b) => b.periodo));
  const mesCompleto = (periodo: string) =>
    otras.size === 0 || existentes.some((b) => b.periodo === periodo && otras.has(b.unidad_id) && b.envios > 0);
  return ventas
    .filter((v) => v.ordenes > 0)
    .map((v) => {
      const a = actual.get(`${v.periodo}|${v.unidad_id}`) ?? null;
      let decision: Decision;
      if (a?.origen === "manual") decision = "conserva_manual";
      else if (a && a.envios === v.ordenes && a.entregados === v.entregadas) decision = "igual";
      else if (delExcel.has(v.periodo) && !opciones.reemplazarExcel) decision = "conserva_excel";
      else if (!mesCompleto(v.periodo) && !opciones.incluirIncompletos) decision = "mes_incompleto";
      else decision = a ? "actualiza" : "nueva";
      return { periodo: v.periodo, unidad_id: v.unidad_id, ordenes: v.ordenes, entregadas: v.entregadas, actual: a, decision };
    })
    .sort((x, y) => x.periodo.localeCompare(y.periodo) || x.unidad_id.localeCompare(y.unidad_id));
}

/** Las filas que hay que escribir en `fin_base_distribucion`. */
export function filasAEscribir(plan: PasoBase[]): { periodo: string; unidad_id: string; envios: number; entregados: number; origen: string }[] {
  return plan
    .filter((p) => p.decision === "nueva" || p.decision === "actualiza")
    .map((p) => ({ periodo: p.periodo, unidad_id: p.unidad_id, envios: p.ordenes, entregados: p.entregadas, origen: ORIGEN_VENTAS }));
}
