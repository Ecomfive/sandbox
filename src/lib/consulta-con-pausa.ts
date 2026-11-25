// Las consultas que se repiten solas en toda la app (presencia, quién está en línea, pedidos nuevos, avisos en pantalla y el contador de la campana)
// también se hacen al volver a la pestaña. Al probar Envíos Delivery (25 nov 2026) se vio que cada vuelta disparaba las cinco aunque se hubieran
// hecho segundos antes: quien va y viene entre Dropi, Shopify y el sistema las repetía a cada rato. Con esto, al volver se consulta solo si la última
// fue hace `minimoMs` o más; el intervalo de cada una (30 o 60 s) sigue igual. Puro, con prueba (el reloj y la visibilidad se pasan desde fuera).

/** Lo mínimo entre una consulta y la que se hace al volver a la pestaña. */
export const PAUSA_AL_VOLVER_MS = 20_000;

export function conPausaAlVolver(
  consultar: () => void,
  minimoMs = PAUSA_AL_VOLVER_MS,
  visible: () => boolean = () => document.visibilityState === "visible",
  reloj: () => number = () => Date.now(),
): { ahora: () => void; alVolver: () => void } {
  let ultima = Number.NEGATIVE_INFINITY;
  /** Consulta ya (al entrar y en cada vuelta del intervalo), si la pestaña está a la vista. */
  const ahora = () => {
    if (!visible()) return;
    ultima = reloj();
    consultar();
  };
  /** Para `visibilitychange`: consulta solo si pasó la pausa desde la última. */
  const alVolver = () => {
    if (reloj() - ultima >= minimoMs) ahora();
  };
  return { ahora, alVolver };
}
