// La comisión de un retiro se sabe al conciliar (14 nov 2026, pedido de Hernán): al crear el retiro no se sabe cuánto cobrará la plataforma o el banco, así
// que se puede dejar vacía (queda en 0) y al conciliar sale sola de lo que llegó: comisión = monto − recibido, y su % sobre el monto. Sin red ni base.

const r2 = (n: number) => Math.round(n * 100) / 100;

/** La comisión y su porcentaje según lo recibido (null si no hay monto o lo recibido no es un número). */
export function comisionDesdeRecibido(monto: number, recibido: number): { comision: number; porcentaje: number } | null {
  if (!(monto > 0) || !Number.isFinite(recibido)) return null;
  const comision = r2(monto - recibido);
  return { comision, porcentaje: r2((comision / monto) * 100) };
}

/** Lo recibido y la comisión a partir del porcentaje (cuando se escribe el % a mano). */
export function desdePorcentaje(monto: number, porcentaje: number): { comision: number; recibido: number } | null {
  if (!(monto > 0) || !Number.isFinite(porcentaje)) return null;
  const comision = r2((monto * porcentaje) / 100);
  return { comision, recibido: r2(monto - comision) };
}

/** Si lo recibido y la comisión cuadran con el monto del retiro (al centavo); si no, por qué. */
export function revisarConciliacion(monto: number, recibido: number, comision: number): string | null {
  if (!(recibido >= 0)) return "Falta el monto recibido.";
  if (!Number.isFinite(comision)) return "La comisión no es válida.";
  if (comision < 0) return "Lo recibido es más que el monto del retiro: revisa el monto o lo recibido.";
  if (Math.abs(r2(monto - comision) - r2(recibido)) > 0.01) return "No cuadra: el monto del retiro menos la comisión tiene que dar lo recibido.";
  return null;
}
