// Guarda en memoria, unos minutos, el resultado de una consulta a algo que casi nunca cambia (los países, la
// plataforma «Dropi», qué plataformas tiene cada país). Vive en el proceso del servidor y lo comparten las
// peticiones que caen en la misma instancia (en Vercel, una instancia caliente atiende varias): la primera paga la
// consulta y las siguientes, no. Sin React, para poder probarlo.
//
// NUNCA lo uses para lo que es de cada persona (permisos, favoritos, sesión): ahí un dato viejo es un fallo de
// seguridad o un menú equivocado. Aquí solo va lo que cambia por una decisión de administración, y tarda unos
// minutos en verse si se cambia a mano en la base (cada instancia vence por su cuenta).

export function conTtl<A extends unknown[], R>(
  ttlMs: number,
  // La clave sale del primer argumento; el resto (el cliente de Supabase) no es parte de ella.
  clave: (primero: A[0]) => string,
  consulta: (...args: A) => Promise<R>,
  opciones: {
    /** Si el resultado no vale (p. ej. «no encontrado»), no se guarda y la siguiente vez se vuelve a consultar. */
    esValido?: (resultado: R) => boolean;
    /** Para las pruebas. */
    ahora?: () => number;
  } = {}
): (...args: A) => Promise<R> {
  const { esValido = () => true, ahora = () => Date.now() } = opciones;
  const guardado = new Map<string, { vence: number; valor: Promise<R> }>();

  return (...args: A) => {
    const k = clave(args[0]);
    const instante = ahora();
    const existente = guardado.get(k);
    if (existente && existente.vence > instante) return existente.valor;

    const valor = consulta(...args);
    guardado.set(k, { vence: instante + ttlMs, valor });
    const olvidar = () => {
      if (guardado.get(k)?.valor === valor) guardado.delete(k);
    };
    valor.then((resultado) => {
      if (!esValido(resultado)) olvidar();
    }, olvidar);
    return valor;
  };
}
