// Anuncios Meta › traer el historial de una cuenta: cómo se parte un rango de fechas en tramos de hasta 30 días, de lo más nuevo a lo más viejo. Lógica pura, con prueba.

const DIA = 86_400_000;
const sumar = (fecha: string, n: number) => new Date(new Date(`${fecha}T00:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);

/** Los tramos que cubren los últimos `dias` días hasta `hoy` (incluido), cada uno de 30 días como mucho, del más nuevo al más viejo y sin huecos ni solapes. Nunca más de 37 meses (lo que guarda Meta). */
export function tramosDeHistorial(hoy: string, dias: number, largo = 30): { desde: string; hasta: string }[] {
  const total = Math.max(1, Math.min(Math.floor(dias), 37 * 31));
  const tramos: { desde: string; hasta: string }[] = [];
  let hasta = hoy;
  let quedan = total;
  while (quedan > 0) {
    const n = Math.min(largo, quedan);
    const desde = sumar(hasta, -(n - 1));
    tramos.push({ desde, hasta });
    hasta = sumar(desde, -1);
    quedan -= n;
  }
  return tramos;
}
