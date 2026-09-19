import {
  CAMPO_POR_ID,
  SIN_VALOR,
  filtrarRetiros,
  opcionesDeSeleccion,
  valoresDeSeleccion,
  type CampoId,
  type Filtro,
} from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";

/** Campos por los que se puede agrupar la tabla (los de selección de los filtros). */
export const CAMPOS_AGRUPABLES = ["estado", "plataforma", "destino", "dropi", "asignado"] as const satisfies readonly CampoId[];
export type CampoAgrupable = (typeof CAMPOS_AGRUPABLES)[number];

export const esCampoAgrupable = (valor: unknown): valor is CampoAgrupable =>
  typeof valor === "string" && (CAMPOS_AGRUPABLES as readonly string[]).includes(valor);

export const etiquetaCampo = (campo: CampoAgrupable) => CAMPO_POR_ID.get(campo)!.etiqueta;

/** Preferencias de vista de la tabla: cada persona guarda las suyas en su navegador. */
export interface Vista {
  agrupar: CampoAgrupable | null;
  mostrarCerrados: boolean;
}

/** Como en ClickUp, los cerrados arrancan ocultos y un botón los muestra. */
export const VISTA_DEFECTO: Vista = { agrupar: null, mostrarCerrados: false };

/** Lee la vista guardada descartando cualquier cosa que no tenga la forma esperada. */
export function parsearVista(json: string): Vista {
  if (json === "") return VISTA_DEFECTO;
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return VISTA_DEFECTO;
  }
  if (typeof datos !== "object" || datos === null) return VISTA_DEFECTO;
  const { agrupar, mostrarCerrados } = datos as { agrupar?: unknown; mostrarCerrados?: unknown };
  return {
    agrupar: esCampoAgrupable(agrupar) ? agrupar : null,
    mostrarCerrados: typeof mostrarCerrados === "boolean" ? mostrarCerrados : VISTA_DEFECTO.mostrarCerrados,
  };
}

/** Un filtro de Estado que incluye "Cerrado" pide verlos: gana sobre el botón de ocultar. */
export function filtroPideCerrados(filtros: Filtro[]): boolean {
  return filtros.some(
    (f) => f.campo === "estado" && f.valor.tipo === "seleccion" && f.valor.valores.includes("cerrado")
  );
}

export interface ResultadoVista {
  /** Retiros que pasan el botón de cerrados y todos los filtros. */
  filas: FilaRetiro[];
  /** Retiros que quedan tras el botón de cerrados, antes de aplicar filtros. */
  base: FilaRetiro[];
  cerradosOcultos: number;
  cerradosVisibles: boolean;
  /** Los cerrados se ven porque un filtro de Estado los pide, no porque el botón esté activado. */
  forzadoPorFiltro: boolean;
}

export function aplicarVista(filas: FilaRetiro[], filtros: Filtro[], mostrarCerrados: boolean): ResultadoVista {
  const forzadoPorFiltro = !mostrarCerrados && filtroPideCerrados(filtros);
  const cerradosVisibles = mostrarCerrados || forzadoPorFiltro;
  const base = cerradosVisibles ? filas : filas.filter((fila) => fila.estado !== "cerrado");
  return {
    filas: filtrarRetiros(base, filtros),
    base,
    cerradosOcultos: filas.length - base.length,
    cerradosVisibles,
    forzadoPorFiltro,
  };
}

export interface Grupo {
  clave: string;
  etiqueta: string;
  filas: FilaRetiro[];
  /** Suma de los montos del grupo. */
  total: number;
}

// Para agrupar por estado se ordena por urgencia de conciliación, no alfabéticamente.
const ORDEN_ESTADOS = ["abierto", "novedad", "cerrado", "cancelado"];

/** Grupos en orden estable: los valores fijos en su orden, el resto alfabético y "Sin ..." al final. */
export function agruparRetiros(filas: FilaRetiro[], campo: CampoAgrupable): Grupo[] {
  const porClave = new Map<string, FilaRetiro[]>();
  for (const fila of filas) {
    const clave = valoresDeSeleccion(fila, campo)[0] ?? SIN_VALOR;
    const grupo = porClave.get(clave);
    if (grupo) grupo.push(fila);
    else porClave.set(clave, [fila]);
  }

  let opciones = opcionesDeSeleccion(filas, campo);
  if (campo === "estado") {
    const etiquetas = new Map(opciones.map((o) => [o.valor, o.etiqueta]));
    opciones = ORDEN_ESTADOS.filter((valor) => etiquetas.has(valor)).map((valor) => ({
      valor,
      etiqueta: etiquetas.get(valor)!,
    }));
  }
  // Un valor que no esté en la lista fija (p. ej. un estado nuevo) no debe desaparecer de la tabla.
  const conocidas = new Set(opciones.map((o) => o.valor));
  for (const clave of porClave.keys()) {
    if (!conocidas.has(clave)) opciones.push({ valor: clave, etiqueta: clave });
  }

  return opciones
    .filter((opcion) => porClave.has(opcion.valor))
    .map((opcion) => {
      const grupoFilas = porClave.get(opcion.valor)!;
      return {
        clave: opcion.valor,
        etiqueta: opcion.etiqueta,
        filas: grupoFilas,
        total: grupoFilas.reduce((suma, fila) => suma + fila.monto, 0),
      };
    });
}
