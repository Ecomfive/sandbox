// Portal AF4 360° › Cierre de mes › Provisión de prestaciones laborales desde la nómina (migración 0927). Lógica pura.
// Ley panameña (Código de Trabajo), sobre el salario devengado del mes de la planilla formal (bruto de `nom_costo_mensual`):
//   · Décimo tercer mes: 1/12 de lo devengado, pagado en tres partidas (15 abr, 15 ago, 15 dic).
//   · Vacaciones: 30 días por cada 11 meses trabajados = 1/11 de lo devengado.
//   · Prima de antigüedad: una semana por año trabajado = 1/52 (≈ 1,923 %).
// La nómina externa (colaboradores en USDT) no genera prestaciones. Cada provisión se propone por tienda y entra al EERR
// como ajuste del cierre (tipo «Provisión prestaciones laborales»). Al pagar el XIII o las vacaciones, ese pago consume la
// provisión: se registra en el libro con EERR = NO para no contarlo dos veces. Datos sensibles: solo roles con Usuarios
// y roles. Prueba en `provisiones.test.ts`.

export const CLAVES_PROVISION = ["xiii", "vacaciones", "prima"] as const;
export type ClaveProvision = (typeof CLAVES_PROVISION)[number];

export const TASA_PROVISION: Record<ClaveProvision, number> = { xiii: 1 / 12, vacaciones: 1 / 11, prima: 1 / 52 };

export const NOMBRE_PROVISION: Record<ClaveProvision, string> = {
  xiii: "Décimo tercer mes",
  vacaciones: "Vacaciones",
  prima: "Prima de antigüedad",
};

export const TIPO_PROVISION = "Provisión prestaciones laborales";

export const esClaveProvision = (v: unknown): v is ClaveProvision => typeof v === "string" && (CLAVES_PROVISION as readonly string[]).includes(v);

export interface BaseNomina {
  /** Tienda de la línea (null = sin tienda). */
  unidadId: string | null;
  /** Salario devengado (bruto) de la planilla formal del mes. */
  bruto: number;
}

export interface LineaProvision {
  unidadId: string;
  base: number;
  monto: number;
}

export interface PropuestaProvision {
  clave: ClaveProvision;
  nombre: string;
  tasa: number;
  base: number;
  monto: number;
  lineas: LineaProvision[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Las tres provisiones del mes, cada una repartida por tienda. Lo que no tiene tienda va a `unidadPorDefecto`
 * (CORPORATIVO). El total de cada provisión es el redondeo del total (la diferencia de centavos va a la línea mayor).
 */
export function proponerProvisiones(bases: BaseNomina[], unidadPorDefecto: string): PropuestaProvision[] {
  const porUnidad = new Map<string, number>();
  for (const b of bases) {
    if (!Number.isFinite(b.bruto) || b.bruto === 0) continue;
    const u = b.unidadId ?? unidadPorDefecto;
    porUnidad.set(u, (porUnidad.get(u) ?? 0) + b.bruto);
  }
  const base = r2([...porUnidad.values()].reduce((a, v) => a + v, 0));
  if (base <= 0) return [];
  return CLAVES_PROVISION.map((clave) => {
    const tasa = TASA_PROVISION[clave];
    const total = r2(base * tasa);
    const lineas = [...porUnidad]
      .filter(([, v]) => v > 0)
      .map(([unidadId, v]) => ({ unidadId, base: r2(v), monto: r2(v * tasa) }))
      .sort((a, b) => b.monto - a.monto);
    const dif = r2(total - lineas.reduce((a, l) => a + l.monto, 0));
    if (lineas.length && Math.abs(dif) >= 0.005) lineas[0].monto = r2(lineas[0].monto + dif);
    return { clave, nombre: NOMBRE_PROVISION[clave], tasa, base, monto: total, lineas };
  });
}

/** La partida del XIII mes a la que pertenece el mes y cuándo se paga (16 dic–15 abr, 16 abr–15 ago, 16 ago–15 dic). */
export function partidaXiii(periodo: string): { partida: 1 | 2 | 3; pago: string } {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  if (mes <= 4) return { partida: 1, pago: `${anio}-04-15` };
  if (mes <= 8) return { partida: 2, pago: `${anio}-08-15` };
  if (mes === 12) return { partida: 1, pago: `${anio + 1}-04-15` };
  return { partida: 3, pago: `${anio}-12-15` };
}
