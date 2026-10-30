// Lo pesado del panel de Dirección, guardado un minuto en el servidor (31 oct 2026, pedido de Hernán: pasar de una pestaña a otra tardaba 2 a 3 s
// porque cada una volvía a calcular la salud de toda la cartera, los productos, las entregas y el Pareto). Es como `cargosGuardados` de la bandeja:
// vive en la instancia del servidor, así que entre pestañas se reutiliza y a lo sumo se ve un minuto atrasado. Las acciones que cambian lo que se
// muestra (atender una alerta, crear su tarea, «Lo lleva», la secuencia de alta) lo borran con `olvidarDireccion`.

const GUARDADO_MS = 60_000;

const guardados = new Map<string, { hasta: number; valor: Promise<unknown> }>();

/**
 * Lo que devuelve `cargar`, guardado un minuto bajo `clave` (que lleva todo lo que cambia el resultado: país, persona, periodo). Dos pedidos a la vez
 * comparten la misma carga. Un error (`{ error }` o una excepción) no se guarda: el próximo pedido vuelve a intentar.
 */
export function guardado<T>(clave: string, cargar: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  for (const [k, g] of guardados) if (g.hasta <= ahora) guardados.delete(k);
  const previo = guardados.get(clave);
  if (previo) return previo.valor as Promise<T>;
  const valor = cargar().then(
    (r) => {
      if (r && typeof r === "object" && "error" in r) guardados.delete(clave);
      return r;
    },
    (e: unknown) => {
      guardados.delete(clave);
      throw e;
    },
  );
  guardados.set(clave, { hasta: ahora + GUARDADO_MS, valor });
  return valor;
}

/** Borra lo guardado: lo llaman las acciones de Dirección después de cambiar algo, para que la próxima pestaña lo muestre ya. */
export function olvidarDireccion(): void {
  guardados.clear();
}
