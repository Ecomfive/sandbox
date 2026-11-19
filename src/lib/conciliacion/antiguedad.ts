// Antigüedad de lo que falta conciliar y aviso de cuentas atrasadas (mejoras 14 y 17, 19 nov 2026). Una línea pendiente o
// sugerida cuenta desde su fecha en el banco hasta hoy, en tramos de 0-7, 8-30 y más de 30 días. Una cuenta está
// atrasada si tiene algo sin conciliar y su última conciliación (o, si nunca se concilió, su línea pendiente más vieja)
// tiene más de `diasAlerta` días. Lógica pura, con prueba en `antiguedad.test.ts`.

export interface LineaAbierta {
  cuentaId: string;
  fecha: string;
  monto: number;
}

export interface AntiguedadCuenta {
  cuentaId: string;
  tramos: { hasta7: number; hasta30: number; mas30: number };
  montos: { hasta7: number; hasta30: number; mas30: number };
  /** Días desde la última línea conciliada (o desde la pendiente más vieja si nunca se concilió). */
  diasSinConciliar: number | null;
  ultimaConciliacion: string | null;
  atrasada: boolean;
}

const dias = (desde: string, hasta: string) => Math.max(0, Math.round((Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / 86_400_000));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function antiguedadPorCuenta(
  abiertas: LineaAbierta[],
  ultimas: Map<string, string>,
  hoy: string,
  diasAlerta: number,
): AntiguedadCuenta[] {
  const porCuenta = new Map<string, AntiguedadCuenta & { masVieja: string | null }>();
  const de = (id: string) => {
    let c = porCuenta.get(id);
    if (!c) {
      c = { cuentaId: id, tramos: { hasta7: 0, hasta30: 0, mas30: 0 }, montos: { hasta7: 0, hasta30: 0, mas30: 0 }, diasSinConciliar: null, ultimaConciliacion: ultimas.get(id) ?? null, atrasada: false, masVieja: null };
      porCuenta.set(id, c);
    }
    return c;
  };
  for (const l of abiertas) {
    const c = de(l.cuentaId);
    const d = dias(l.fecha, hoy);
    const tramo = d <= 7 ? "hasta7" : d <= 30 ? "hasta30" : "mas30";
    c.tramos[tramo]++;
    c.montos[tramo] = r2(c.montos[tramo] + Math.abs(l.monto));
    if (!c.masVieja || l.fecha < c.masVieja) c.masVieja = l.fecha;
  }
  for (const id of ultimas.keys()) de(id);
  return [...porCuenta.values()]
    .map(({ masVieja, ...c }) => {
      const abiertasN = c.tramos.hasta7 + c.tramos.hasta30 + c.tramos.mas30;
      const referencia = c.ultimaConciliacion ?? masVieja;
      const diasSin = referencia ? dias(referencia, hoy) : null;
      return { ...c, diasSinConciliar: diasSin, atrasada: abiertasN > 0 && diasSin !== null && diasSin > diasAlerta };
    })
    .sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || b.tramos.mas30 - a.tramos.mas30);
}
