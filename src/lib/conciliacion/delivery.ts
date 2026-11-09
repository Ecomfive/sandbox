// Lo que la conciliación busca de Deliverys (migración 0911): por repartidor y semana (jueves a miércoles), lo que se le
// paga por cada tienda y el neto de la semana. Lógica pura: recibe las filas ya leídas de `conc_delivery_tiendas`,
// `del_cierres` y `del_repartidores` (migración 0916) y devuelve los `SemanaDel` que usa `emparejar`. Prueba en
// `delivery.test.ts`.

import type { SemanaDel } from "./emparejar";

export interface FilaTiendaSemana {
  repartidor_id: string;
  semana: string;
  unidad_id: string;
  pago_aparte: boolean;
  /** Tarifas + propinas de esa tienda. */
  monto: number;
  cobrado_efectivo: number;
}

export interface FilaCierre {
  repartidor_id: string;
  semana: string;
  estado: "abierto" | "cerrado" | "pagado";
  adelantos: number;
  descuentos: number;
  neto: number | null;
  fecha_pago: string | null;
}

export interface FilaRepartidor {
  id: string;
  nombre: string;
  alias: string[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Por cada repartidor y semana: una entrada por tienda (lo que se le paga por ella) y una por la semana completa (el neto:
 * cerrado, el del cierre; abierto, tarifas y propinas de las tiendas que paga la empresa − adelantos − descuentos − lo
 * cobrado en efectivo). Neto positivo = se le paga; negativo = rinde. `confirmadas` (claves `repartidor|semana|unidad`,
 * unidad vacía = la semana) quedan fuera: lo ya conciliado no se vuelve a ofrecer.
 */
export function semanasDelivery(
  tiendas: FilaTiendaSemana[],
  cierres: FilaCierre[],
  repartidores: FilaRepartidor[],
  nombreUnidad: Map<string, string>,
  confirmadas: Set<string> = new Set(),
): SemanaDel[] {
  const rep = new Map(repartidores.map((r) => [r.id, r]));
  const cierreDe = new Map(cierres.map((c) => [`${c.repartidor_id}|${c.semana}`, c]));
  const porSemana = new Map<string, FilaTiendaSemana[]>();
  for (const t of tiendas) porSemana.set(`${t.repartidor_id}|${t.semana}`, [...(porSemana.get(`${t.repartidor_id}|${t.semana}`) ?? []), t]);
  const salida: SemanaDel[] = [];
  for (const [clave, lista] of porSemana) {
    const r = rep.get(lista[0].repartidor_id);
    if (!r || confirmadas.has(`${clave}|`)) continue;
    const base = { repartidorId: r.id, nombre: r.nombre, nombres: [r.nombre, ...r.alias], semana: lista[0].semana };
    const cierre = cierreDe.get(clave);
    let algunaTienda = false;
    for (const t of lista) {
      if (confirmadas.has(`${clave}|${t.unidad_id}`)) {
        algunaTienda = true;
        continue;
      }
      if (t.monto <= 0) continue;
      salida.push({ ...base, unidadId: t.unidad_id, tienda: nombreUnidad.get(t.unidad_id) ?? null, pagar: r2(t.monto), rendir: 0, pago: null });
    }
    // Si ya se concilió alguna tienda por separado, la semana completa no se ofrece.
    if (algunaTienda) continue;
    const neto =
      cierre && cierre.estado !== "abierto" && cierre.neto !== null
        ? cierre.neto
        : r2(
            lista.filter((t) => !t.pago_aparte).reduce((a, t) => a + t.monto, 0) -
              (cierre?.adelantos ?? 0) -
              (cierre?.descuentos ?? 0) -
              lista.reduce((a, t) => a + t.cobrado_efectivo, 0),
          );
    salida.push({
      ...base,
      unidadId: null,
      tienda: null,
      pagar: neto > 0 ? r2(neto) : 0,
      rendir: neto < 0 ? r2(-neto) : 0,
      pago: cierre?.estado === "pagado" && cierre.fecha_pago && neto > 0 ? { fecha: cierre.fecha_pago, monto: r2(neto) } : null,
    });
  }
  return salida;
}
