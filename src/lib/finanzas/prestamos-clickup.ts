// Lectura de las listas de ClickUp de préstamos (Préstamos a México, Préstamos a Costa Rica y Financiamientos Ortoped&Co)
// para Tesorería › Préstamos del grupo. Pura: la usa scripts/importar-prestamos-clickup.ts y su prueba. Solo se importa lo
// que tiene un monto claro; lo que depende de un estado de cuenta aparte o es ambiguo vuelve en `porRevisar` con el motivo.

import { leerCsv } from "./meta-ads-csv";
import { leerOrdenes, type TipoMovGrupo } from "./prestamos-grupo";

export const PARTE = {
  PA: "Ecomfive Panamá",
  CR: "Ecomfive Costa Rica",
  MX: "Ecomfive México",
  VE: "Ecomfive Venezuela",
  ALCIDES: "Alcides",
  ORTOPED: "Ortoped&Co SPA",
} as const;

export interface MovClickup {
  /** `clickup:<id de la tarea>:<n>`: con él, volver a importar no repite nada. */
  clave: string;
  acreedor: string;
  deudor: string;
  tipo: TipoMovGrupo;
  fecha: string;
  vence: string | null;
  monto: number;
  concepto: string;
  ordenes: string[];
  medio: string | null;
  nota: string | null;
}

export interface PorRevisar {
  tarea: string;
  nombre: string;
  motivo: string;
}

export type ListaClickup = "mexico" | "costa_rica" | "ortoped";

const MESES: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };

/** «Wednesday, November 18th 2026» o «…, 1:11:13 pm -05:00» → «2026-11-18». */
export function fechaClickup(texto: string | undefined): string | null {
  const m = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(texto ?? "");
  const mes = m && MESES[m[1].toLowerCase()];
  return m && mes ? `${m[3]}-${mes}-${m[2].padStart(2, "0")}` : null;
}

const numero = (t: string | undefined) => {
  const n = Number(String(t ?? "").replace(/[$\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Qué lista es, por su nombre de archivo («… - Prestamos A Mexico.csv»). */
export function listaDeArchivo(nombre: string): ListaClickup | null {
  const n = nombre.toLowerCase();
  if (n.includes("ortoped")) return "ortoped";
  if (n.includes("costa")) return "costa_rica";
  if (n.includes("mexico") || n.includes("méxico")) return "mexico";
  return null;
}

function aObjetos(texto: string): Record<string, string>[] {
  const [cab, ...filas] = leerCsv(texto);
  if (!cab) return [];
  return filas.filter((f) => f.some((c) => c.trim())).map((f) => Object.fromEntries(cab.map((c, i) => [c.trim(), (f[i] ?? "").trim()])));
}

/** El acreedor de una tarea de la lista de Costa Rica según «Prestamo de». */
function acreedorDe(prestamoDe: string): string | null {
  const p = prestamoDe.toLowerCase();
  if (p.includes("alcides")) return PARTE.ALCIDES;
  if (p.includes("panam")) return PARTE.PA;
  if (p.includes("méxico") || p.includes("mexico")) return PARTE.MX;
  if (p.includes("ortoped")) return PARTE.ORTOPED;
  return null;
}

export function leerListaClickup(texto: string, lista: ListaClickup): { movimientos: MovClickup[]; porRevisar: PorRevisar[] } {
  const movimientos: MovClickup[] = [];
  const porRevisar: PorRevisar[] = [];
  for (const r of aObjetos(texto)) {
    const id = r["Task ID"];
    const nombre = r["Task Name"];
    if (!id || !nombre) continue;
    const creada = fechaClickup(r["Date Created"]);
    const inversion = numero(r["Inversión (currency)"]);
    const prestamoDe = r["Prestamo de (drop down)"] ?? "";
    const revisar = (motivo: string) => porRevisar.push({ tarea: id, nombre, motivo });
    const base = { ordenes: leerOrdenes(nombre), medio: null as string | null, nota: null as string | null };

    if (lista === "ortoped") {
      // Cada orden financiada: lo que puso Ortoped&Co y el 20 % (o lo que diga) que cobra al vencer. Panamá paga los retornos.
      const vence = fechaClickup(r["Fecha de pago (date)"]);
      const fecha = fechaClickup(r["Start Date"]) ?? creada;
      const retorno = numero(r["Retorno (formula)"]) || r2(inversion * (1 + numero(r["Porcentaje ROI (number)"]) / 100));
      if (!inversion || !fecha) {
        revisar("Sin monto o sin fecha");
        continue;
      }
      const v = vence && vence >= fecha ? vence : null;
      const concepto = `Financiamiento Ortoped&Co · ${nombre}`;
      movimientos.push({ ...base, clave: `clickup:${id}:1`, acreedor: PARTE.ORTOPED, deudor: PARTE.PA, tipo: "prestamo", fecha, vence: v, monto: inversion, concepto });
      if (retorno > inversion) movimientos.push({ ...base, clave: `clickup:${id}:2`, acreedor: PARTE.ORTOPED, deudor: PARTE.PA, tipo: "costo", fecha, vence: v, monto: r2(retorno - inversion), concepto: `Costo del financiamiento · ${nombre}` });
      continue;
    }

    if (lista === "mexico") {
      // «Deuda MX a VZLA»: la nota dice cuánto prestó Venezuela; «Deuda MX a PA» depende del estado de cuenta.
      const comentario = r["Latest Comment"] ?? "";
      const vzla = /VZLA LE PREST[ÓO] A MX \$?([\d.,]+)/i.exec(comentario);
      if (/vzla/i.test(nombre) && vzla && creada) {
        movimientos.push({ ...base, clave: `clickup:${id}:1`, acreedor: PARTE.VE, deudor: PARTE.MX, tipo: "prestamo", fecha: creada, vence: null, monto: numero(vzla[1]), concepto: "Préstamo de Venezuela a México", nota: "Para el pago de US$11.880" });
      } else revisar("El saldo está en el estado de cuenta adjunto en ClickUp (Estado_Cuenta_MX_Panama.xlsx): cargarlo a mano.");
      continue;
    }

    // Costa Rica.
    const contenido = r["Task Content"] ?? "";
    if (/^Deuda CR a/i.test(nombre)) {
      revisar("El saldo está en el estado de cuenta adjunto en ClickUp: cargarlo a mano.");
      continue;
    }
    if (/Cr[ée]dito TDC/i.test(nombre)) {
      revisar("No queda claro si es deuda con Alcides o un cupo que se va usando: confirmar con Alcides antes de cargarlo.");
      continue;
    }
    if (/financiadas %/i.test(nombre)) {
      revisar("Sin montos: lo que se paga a Ortoped&Co por Costa Rica se carga a mano.");
      continue;
    }
    if (/Pr[ée]stamo de Ecomfive M[ée]xico/i.test(nombre)) {
      // El detalle viene en el texto: préstamo, comisiones y el abono con órdenes.
      for (const [i, linea] of contenido.split(/\r?\n/).entries()) {
        const m = /^\s*(-)?\$([\d.,]+)\s+(.+?)\s*\((\d{2})\/(\d{2})\/(\d{4})\)/.exec(linea);
        if (!m) continue;
        const fecha = `${m[6]}-${m[5]}-${m[4]}`;
        const tipo: TipoMovGrupo = m[1] ? "abono" : /comisi/i.test(m[3]) ? "costo" : "prestamo";
        movimientos.push({ ...base, clave: `clickup:${id}:${i + 1}`, acreedor: PARTE.MX, deudor: PARTE.CR, tipo, fecha, vence: null, monto: numero(m[2]), concepto: m[3].trim() });
      }
      continue;
    }
    const acreedor = acreedorDe(prestamoDe);
    if (!acreedor || !inversion || !creada) {
      revisar("Sin quién prestó, sin monto o sin fecha");
      continue;
    }
    if (/Pr[ée]stamo de Ecomfive Panam/i.test(nombre)) {
      // «Total de esta deuda (23/04/2026) $14589,45»: el préstamo más 1 % por el cambio.
      const total = /\$\s*([\d.]+),(\d{2})/.exec(contenido);
      const fecha = /\((\d{2})\/(\d{2})\/(\d{4})\)/.exec(contenido);
      const f = fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : creada;
      movimientos.push({ ...base, clave: `clickup:${id}:1`, acreedor, deudor: PARTE.CR, tipo: "prestamo", fecha: f, vence: null, monto: inversion, concepto: "Préstamo de Panamá a Costa Rica" });
      const totalN = total ? Number(`${total[1]}.${total[2]}`) : 0;
      if (totalN > inversion) movimientos.push({ ...base, clave: `clickup:${id}:2`, acreedor, deudor: PARTE.CR, tipo: "costo", fecha: f, vence: null, monto: r2(totalN - inversion), concepto: "1 % por el cambio" });
      continue;
    }
    const medio = /tdc/i.test(prestamoDe) ? "Tarjeta de Alcides" : null;
    movimientos.push({ ...base, medio, clave: `clickup:${id}:1`, acreedor, deudor: PARTE.CR, tipo: "prestamo", fecha: creada, vence: null, monto: inversion, concepto: base.ordenes.length ? `Pago de la orden ${nombre}` : nombre });
  }
  return { movimientos, porRevisar };
}
