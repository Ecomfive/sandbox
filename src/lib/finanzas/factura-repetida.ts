// Facturas cargadas dos veces en el libro (mejora 8, 19 nov 2026): el mismo N° de factura del mismo proveedor en dos
// movimientos vivos. Se compara sin guiones, espacios ni ceros a la izquierda («F-0099» = «f 99», «0001234» = «1234»). Si los dos
// traen RUC, tiene que ser el mismo; si a alguno le falta, además tiene que coincidir el monto (si no, dos proveedores
// con la misma numeración saldrían como repetidas). Lógica pura, con prueba en `factura-repetida.test.ts`.

export interface MovFactura {
  id: string;
  periodo: string;
  monto: number;
  facturaNumero: string | null;
  ruc: string | null;
  anulado?: boolean;
}

export interface Repetida {
  id: string;
  periodo: string;
  monto: number;
}

/** «F-0001234» → «F1234»; vacío si no queda nada. */
export const numeroFactura = (v: string | null | undefined) =>
  (v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(^|[A-Z])0+(?=\d)/g, "$1");

/** El RUC sin el DV ni signos: «8-123-456 DV 12» → «8123456». */
export const rucBase = (v: string | null | undefined) =>
  (v ?? "")
    .toUpperCase()
    .replace(/\s*DV\s*\d*\s*$/, "")
    .replace(/[^A-Z0-9]/g, "");

/** Para cada movimiento con la factura repetida, los otros movimientos con esa factura. */
export function facturasRepetidas(movs: MovFactura[]): Map<string, Repetida[]> {
  const porNumero = new Map<string, MovFactura[]>();
  for (const m of movs) {
    if (m.anulado) continue;
    const n = numeroFactura(m.facturaNumero);
    if (n.length < 3) continue;
    porNumero.set(n, [...(porNumero.get(n) ?? []), m]);
  }
  const salida = new Map<string, Repetida[]>();
  for (const grupo of porNumero.values()) {
    if (grupo.length < 2) continue;
    for (const a of grupo) {
      const otros = grupo.filter((b) => {
        if (b.id === a.id) return false;
        const ra = rucBase(a.ruc);
        const rb = rucBase(b.ruc);
        if (ra && rb) return ra === rb;
        return Math.abs(a.monto - b.monto) < 0.005;
      });
      if (otros.length) salida.set(a.id, otros.map((b) => ({ id: b.id, periodo: b.periodo, monto: b.monto })));
    }
  }
  return salida;
}
