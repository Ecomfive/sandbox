// «Importar un mes completo» (pedido de María José, Oceans, 19 nov 2026): el mes se arma completo en un Excel y, al
// cargarlo, reemplaza lo importado de ese mes en el libro de esa entidad, aunque haya venido de otro archivo o se haya
// pegado. Así no quedan duplicados cuando una fila cambió entre un archivo y otro (la huella sale del contenido).
// Lógica pura (sin Supabase): la usan `guardar-libro.ts` y la pantalla de importar. Prueba en `mes-completo.test.ts`.

import { mesesDeMovimiento } from "./cierre";
import { ORIGEN_PEGADO } from "./movimiento-manual";

/** Un movimiento del mes tal como lo lee el plan. */
export interface MovimientoDelMes {
  id: string;
  origen: string;
  origen_clave: string | null;
  periodo: string;
  fecha_pago: string | null;
}

export interface PlanMesCompleto {
  /** Lo que se borra: importado de otro archivo (o pegado) que no vino en este. */
  borrar: string[];
  /** Cuántos se borran de cada origen (archivo o «pegado»), de más a menos. */
  porOrigen: { origen: string; cantidad: number }[];
  /** Lo que se queda aunque no venga en el archivo. */
  conservados: {
    /** Cargado a mano, recurrentes y lo que genera el sistema (nómina, remesas, órdenes, ajustes de cierre…). */
    delSistema: number;
    /** Emparejado con una línea del banco: se deshace en Conciliación bancaria antes de reemplazarlo. */
    conciliados: number;
    /** En un mes cerrado (por el mes del libro o por el de pago). */
    enMesCerrado: number;
  };
}

/** Un origen que vino de un archivo de planilla. `origenDeArchivo` conserva la extensión. */
const DE_ARCHIVO = /\.(xlsx|xlsm|xls|csv)$/i;

/** Lo que el mes completo puede reemplazar: lo importado de un archivo y lo pegado desde Excel. Nunca lo demás. */
export function esReemplazable(origen: string): boolean {
  return origen === ORIGEN_PEGADO || DE_ARCHIVO.test(origen.trim());
}

/** El primer día del mes («2026-08» o «2026-08-15» → «2026-08-01»), o null si no es una fecha. */
export function periodoDeMes(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(valor.trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/**
 * Decide qué se borra del mes. `huellas` son las del archivo (lo que vino, se actualiza por su huella y no se borra);
 * lo del mismo archivo que no vino también se borra (el archivo trae el mes entero).
 */
export function planMesCompleto(
  movimientos: MovimientoDelMes[],
  opciones: { huellas: Set<string>; conciliados: Set<string>; cerrados: Set<string> },
): PlanMesCompleto {
  const borrar: string[] = [];
  const porOrigen = new Map<string, number>();
  const conservados = { delSistema: 0, conciliados: 0, enMesCerrado: 0 };
  for (const m of movimientos) {
    if (m.origen_clave && opciones.huellas.has(m.origen_clave)) continue;
    if (!esReemplazable(m.origen)) {
      conservados.delSistema++;
      continue;
    }
    if (mesesDeMovimiento({ periodo: m.periodo.slice(0, 10), fecha_pago: m.fecha_pago }).some((x) => opciones.cerrados.has(x))) {
      conservados.enMesCerrado++;
      continue;
    }
    if (opciones.conciliados.has(m.id)) {
      conservados.conciliados++;
      continue;
    }
    borrar.push(m.id);
    porOrigen.set(m.origen, (porOrigen.get(m.origen) ?? 0) + 1);
  }
  return {
    borrar,
    porOrigen: [...porOrigen].map(([origen, cantidad]) => ({ origen, cantidad })).sort((a, b) => b.cantidad - a.cantidad || a.origen.localeCompare(b.origen)),
    conservados,
  };
}
