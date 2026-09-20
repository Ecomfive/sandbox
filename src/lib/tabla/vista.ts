import {
  SIN_VALOR,
  campoDe,
  filtrarFilas,
  opcionesDeSeleccion,
  valoresDeSeleccion,
  type DefTabla,
  type Filtro,
} from "./motor";

export type OrdenGrupos = "asc" | "desc";

/** Preferencias de vista de la tabla: cada persona guarda las suyas en su navegador. */
export interface Vista {
  agrupar: string | null;
  /** Sentido en que se ordenan los grupos (no las filas dentro de cada grupo). */
  orden: OrdenGrupos;
  mostrarCerrados: boolean;
}

/** Campos por los que esta tabla se puede agrupar. */
export function camposAgrupables<F>(def: DefTabla<F>): string[] {
  return def.campos.filter((c) => c.tipo === "seleccion" && c.agrupable).map((c) => c.id);
}

/**
 * Vista inicial. Como en ClickUp, en las tablas con "cerrados" un botón los muestra u oculta; si la
 * tabla lo pide arrancan ocultos (colas de trabajo) y si no, a la vista (reportes).
 */
export function vistaDefecto<F>(def: DefTabla<F>): Vista {
  const inicial = def.vistaInicial;
  const agrupar = inicial && camposAgrupables(def).includes(inicial.agrupar) ? inicial.agrupar : null;
  return {
    agrupar,
    orden: agrupar ? (inicial?.orden ?? "asc") : "asc",
    mostrarCerrados: def.cerrados ? !def.cerrados.ocultosPorDefecto : true,
  };
}

/** Lee la vista guardada descartando cualquier cosa que no tenga la forma esperada. */
export function parsearVista<F>(def: DefTabla<F>, json: string): Vista {
  const defecto = vistaDefecto(def);
  if (json === "") return defecto;
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return defecto;
  }
  if (typeof datos !== "object" || datos === null) return defecto;
  const { agrupar, orden, mostrarCerrados } = datos as { agrupar?: unknown; orden?: unknown; mostrarCerrados?: unknown };
  return {
    agrupar: typeof agrupar === "string" && camposAgrupables(def).includes(agrupar) ? agrupar : null,
    orden: orden === "desc" ? "desc" : "asc",
    mostrarCerrados: typeof mostrarCerrados === "boolean" ? mostrarCerrados : defecto.mostrarCerrados,
  };
}

/** Un filtro sobre el campo de estado que incluye un valor "cerrado" pide verlos: gana sobre el botón. */
export function filtroPideCerrados<F>(def: DefTabla<F>, filtros: Filtro[]): boolean {
  const cerrados = def.cerrados;
  if (!cerrados) return false;
  const cierra = Array.isArray(cerrados.valoresCerrados)
    ? (valor: string) => (cerrados.valoresCerrados as string[]).includes(valor)
    : cerrados.valoresCerrados;
  return filtros.some((f) => f.campo === cerrados.campoEstado && f.valor.tipo === "seleccion" && f.valor.valores.some(cierra));
}

export interface ResultadoVista<F> {
  /** Filas que pasan el botón de cerrados y todos los filtros. */
  filas: F[];
  /** Filas que quedan tras el botón de cerrados, antes de aplicar filtros. */
  base: F[];
  cerradosOcultos: number;
  cerradosVisibles: boolean;
  /** Los cerrados se ven porque un filtro pide su estado, no porque el botón esté activado. */
  forzadoPorFiltro: boolean;
}

export function aplicarVista<F>(
  def: DefTabla<F>,
  filas: F[],
  filtros: Filtro[],
  mostrarCerrados: boolean
): ResultadoVista<F> {
  const cerrados = def.cerrados;
  const forzadoPorFiltro = !mostrarCerrados && filtroPideCerrados(def, filtros);
  const cerradosVisibles = !cerrados || mostrarCerrados || forzadoPorFiltro;
  const base = cerradosVisibles || !cerrados ? filas : filas.filter((fila) => !cerrados.esCerrado(fila));
  return {
    filas: filtrarFilas(def, base, filtros),
    base,
    cerradosOcultos: filas.length - base.length,
    cerradosVisibles,
    forzadoPorFiltro,
  };
}

export interface Grupo<F> {
  clave: string;
  etiqueta: string;
  filas: F[];
  /** Suma de `def.total` sobre las filas del grupo (0 si la tabla no define total). */
  total: number;
}

/** Grupos en orden estable: el preferido del campo o las opciones en su orden; en descendente se invierte, y "Sin ..." queda siempre al final. */
export function agruparFilas<F>(def: DefTabla<F>, filas: F[], campo: string, orden: OrdenGrupos = "asc"): Grupo<F>[] {
  const porClave = new Map<string, F[]>();
  for (const fila of filas) {
    const clave = valoresDeSeleccion(def, fila, campo)[0] ?? SIN_VALOR;
    const grupo = porClave.get(clave);
    if (grupo) grupo.push(fila);
    else porClave.set(clave, [fila]);
  }

  let opciones = opcionesDeSeleccion(def, filas, campo);
  const definicion = campoDe(def, campo);
  const preferido = definicion?.tipo === "seleccion" ? definicion.ordenGrupos : undefined;
  if (preferido) {
    const etiquetas = new Map(opciones.map((o) => [o.valor, o.etiqueta]));
    opciones = preferido.filter((valor) => etiquetas.has(valor)).map((valor) => ({ valor, etiqueta: etiquetas.get(valor)! }));
  }
  // Un valor que no esté en la lista fija (p. ej. un estado nuevo) no debe desaparecer de la tabla.
  const conocidas = new Set(opciones.map((o) => o.valor));
  for (const clave of porClave.keys()) {
    if (!conocidas.has(clave)) opciones.push({ valor: clave, etiqueta: clave });
  }

  const grupos = opciones
    .filter((opcion) => porClave.has(opcion.valor))
    .map((opcion) => {
      const grupoFilas = porClave.get(opcion.valor)!;
      return {
        clave: opcion.valor,
        etiqueta: opcion.etiqueta,
        filas: grupoFilas,
        total: def.total ? grupoFilas.reduce((suma, fila) => suma + def.total!(fila), 0) : 0,
      };
    });
  if (orden === "asc") return grupos;

  const sinValor = grupos.filter((grupo) => grupo.clave === SIN_VALOR);
  return [...grupos.filter((grupo) => grupo.clave !== SIN_VALOR).reverse(), ...sinValor];
}
