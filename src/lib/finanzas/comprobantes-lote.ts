// Comprobantes en lote (mejora 7, 19 nov 2026): se sueltan varios archivos y cada uno se empareja con un movimiento del
// mes por el monto y, si lo trae, la fecha escritos en el nombre del archivo («factura 150.25 2026-08-14.pdf»). Solo
// propone: la persona confirma cada uno antes de adjuntar. Lógica pura, con prueba en `comprobantes-lote.test.ts`.

export interface MovLote {
  id: string;
  monto: number;
  fecha: string | null;
  descripcion: string;
}

export interface Lectura {
  monto: number | null;
  fecha: string | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** El monto y la fecha que trae el nombre de un archivo (sin la extensión). */
export function leerNombre(nombre: string): Lectura {
  const base = nombre.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  let fecha: string | null = null;
  let resto = base;
  const iso = base.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/);
  const dmy = base.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
  if (iso) {
    fecha = `${iso[1]}-${iso[2]}-${iso[3]}`;
    resto = resto.replace(iso[0], " ");
  } else if (dmy) {
    fecha = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    resto = resto.replace(dmy[0], " ");
  }
  if (fecha && Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) fecha = null;
  // Montos con decimales: «1,500.25», «1.500,25», «150.25», «150,25». Sin decimales solo con «$» delante.
  const candidatos: number[] = [];
  for (const m of resto.matchAll(/\$?\s?(\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g)) {
    const t = m[1];
    const dec = t.slice(-3, -2);
    const entero = t.slice(0, -3).replace(/[.,]/g, "");
    candidatos.push(Number(`${entero}${dec ? "." : ""}${t.slice(-2)}`));
  }
  if (!candidatos.length) for (const m of resto.matchAll(/\$\s?(\d{1,7})(?![\d.,])/g)) candidatos.push(Number(m[1]));
  const monto = candidatos.filter((n) => Number.isFinite(n) && n > 0).at(-1);
  return { monto: monto === undefined ? null : r2(monto), fecha };
}

const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Los movimientos con el mismo monto (al centavo), primero los de fecha más cercana. `sugerido` es el único candidato o,
 * con varios, el único a 3 días o menos de la fecha del archivo; si no se puede decidir, ninguno.
 */
export function candidatosDe(lectura: Lectura, movs: MovLote[]): { candidatos: MovLote[]; sugerido: string | null } {
  if (lectura.monto === null) return { candidatos: [], sugerido: null };
  const mismos = movs.filter((m) => Math.abs(m.monto - lectura.monto!) < 0.005);
  const f = lectura.fecha;
  if (f) mismos.sort((a, b) => (a.fecha ? dias(a.fecha, f) : 999) - (b.fecha ? dias(b.fecha, f) : 999));
  if (mismos.length === 1) return { candidatos: mismos, sugerido: mismos[0].id };
  if (f) {
    const cerca = mismos.filter((m) => m.fecha && dias(m.fecha, f) <= 3);
    if (cerca.length === 1) return { candidatos: mismos, sugerido: cerca[0].id };
  }
  return { candidatos: mismos, sugerido: null };
}
