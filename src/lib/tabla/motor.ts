// Motor común de las tablas con barra de herramientas (filtros, agrupar, cerrados, columnas).
// Cada módulo describe su tabla con una `DefTabla` (qué campos tiene y cómo leerlos de una fila);
// todo lo demás —filtrar, ofrecer opciones, guardar, agrupar— es igual para todos.

export const SIN_VALOR = "__sin_valor__";

export type TipoCampo = "seleccion" | "fecha" | "numero" | "texto";

export interface Opcion {
  valor: string;
  etiqueta: string;
}

interface CampoComun {
  id: string;
  etiqueta: string;
}

export interface CampoSeleccion<F> extends CampoComun {
  tipo: "seleccion";
  /** Valores de la fila para este campo; usa SIN_VALOR cuando no tiene. */
  valores: (fila: F) => string[];
  /** Opciones fijas (con su orden). Sin ellas se arman con los valores que hay en las filas. */
  opciones?: () => Opcion[];
  /** Nombre de la opción "sin valor" cuando las opciones salen de las filas. */
  etiquetaSinValor?: string;
  /**
   * Cómo se muestra un valor cuando las opciones salen de las filas (por defecto, el valor tal cual).
   * Sirve para valores que ordenan bien pero se leen mal, como una fecha ISO.
   */
  formatearValor?: (valor: string) => string;
  /** Se puede agrupar la tabla por este campo. */
  agrupable?: boolean;
  /** Orden preferido de los grupos (por valor); los que falten van después. */
  ordenGrupos?: string[];
}

export interface CampoFecha<F> extends CampoComun {
  tipo: "fecha";
  valor: (fila: F) => string | null;
}

export interface CampoNumero<F> extends CampoComun {
  tipo: "numero";
  valor: (fila: F) => number | null;
}

export interface CampoTexto<F> extends CampoComun {
  tipo: "texto";
  valor: (fila: F) => string;
}

export type CampoDef<F> = CampoSeleccion<F> | CampoFecha<F> | CampoNumero<F> | CampoTexto<F>;

export interface DefTabla<F> {
  /** Identifica la tabla en lo que se guarda en el navegador ("retiros" -> "retiros-filtros-v1"). */
  clave: string;
  campos: CampoDef<F>[];
  /** Filas "cerradas" (terminadas) que un botón muestra u oculta. Sin esto la tabla no tiene ese botón. */
  cerrados?: {
    /** Nombre del botón y de esas filas, en plural: "Cerrados", "Resueltas", "Entregados". */
    etiqueta: string;
    esCerrado: (fila: F) => boolean;
    /**
     * Campo de selección que dice si está cerrada, y qué valores la cierran (lista o regla, para estados
     * que llegan de fuera y pueden cambiar de texto): un filtro con ellos pide verlas.
     */
    campoEstado: string;
    valoresCerrados: string[] | ((valor: string) => boolean);
    ocultosPorDefecto: boolean;
  };
  /** Cantidad que se suma por grupo (monto, unidades...). Sin esto los grupos solo cuentan filas. */
  total?: (fila: F) => number;
  /** Vista con la que arranca quien aún no eligió una (por ejemplo, agrupada por extracto). */
  vistaInicial?: { agrupar: string; orden?: "asc" | "desc" };
}

export type ValorFiltro =
  | { tipo: "seleccion"; valores: string[] }
  | { tipo: "fecha"; desde: string; hasta: string }
  | { tipo: "numero"; min: string; max: string }
  | { tipo: "texto"; texto: string };

export interface Filtro {
  campo: string;
  valor: ValorFiltro;
}

export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function campoDe<F>(def: DefTabla<F>, id: string): CampoDef<F> | undefined {
  return def.campos.find((c) => c.id === id);
}

function parseNumero(texto: string): number | null {
  if (texto.trim() === "") return null;
  const numero = Number(texto.replace(",", "."));
  return Number.isNaN(numero) ? null : numero;
}

export function filtroVacio<F>(def: DefTabla<F>, campo: string): Filtro {
  const definicion = campoDe(def, campo);
  if (!definicion) throw new Error(`Campo desconocido: ${campo}`);
  switch (definicion.tipo) {
    case "seleccion":
      return { campo, valor: { tipo: "seleccion", valores: [] } };
    case "fecha":
      return { campo, valor: { tipo: "fecha", desde: "", hasta: "" } };
    case "numero":
      return { campo, valor: { tipo: "numero", min: "", max: "" } };
    case "texto":
      return { campo, valor: { tipo: "texto", texto: "" } };
  }
}

/** Un filtro sin valor elegido no afecta la tabla. */
export function filtroActivo({ valor }: Filtro): boolean {
  switch (valor.tipo) {
    case "seleccion":
      return valor.valores.length > 0;
    case "fecha":
      return valor.desde !== "" || valor.hasta !== "";
    case "numero":
      return parseNumero(valor.min) !== null || parseNumero(valor.max) !== null;
    case "texto":
      return valor.texto.trim() !== "";
  }
}

/** Valores de una fila en un campo de selección (vacío si el campo no es de selección). */
export function valoresDeSeleccion<F>(def: DefTabla<F>, fila: F, campo: string): string[] {
  const definicion = campoDe(def, campo);
  return definicion?.tipo === "seleccion" ? definicion.valores(fila) : [];
}

/** Opciones fijas si el campo las define; si no, las que hay en las filas (alfabéticas) y "sin valor" al final. */
export function opcionesDeSeleccion<F>(def: DefTabla<F>, filas: F[], campo: string): Opcion[] {
  const definicion = campoDe(def, campo);
  if (!definicion || definicion.tipo !== "seleccion") return [];
  if (definicion.opciones) return definicion.opciones();

  const conocidos = new Set<string>();
  let haySinValor = false;
  for (const fila of filas) {
    for (const valor of definicion.valores(fila)) {
      if (valor === SIN_VALOR) haySinValor = true;
      else conocidos.add(valor);
    }
  }
  const opciones = [...conocidos]
    .sort((a, b) => a.localeCompare(b))
    .map((valor) => ({ valor, etiqueta: definicion.formatearValor?.(valor) ?? valor }));
  if (haySinValor) opciones.push({ valor: SIN_VALOR, etiqueta: definicion.etiquetaSinValor ?? "Sin dato" });
  return opciones;
}

function coincide<F>(def: DefTabla<F>, fila: F, filtro: Filtro): boolean {
  const definicion = campoDe(def, filtro.campo);
  if (!definicion) return true;
  const valor = filtro.valor;
  switch (valor.tipo) {
    case "seleccion":
      return definicion.tipo === "seleccion" && definicion.valores(fila).some((v) => valor.valores.includes(v));
    case "fecha": {
      if (definicion.tipo !== "fecha") return false;
      const fecha = definicion.valor(fila)?.slice(0, 10) ?? null;
      if (fecha === null) return false;
      if (valor.desde !== "" && fecha < valor.desde) return false;
      if (valor.hasta !== "" && fecha > valor.hasta) return false;
      return true;
    }
    case "numero": {
      if (definicion.tipo !== "numero") return false;
      const numero = definicion.valor(fila);
      if (numero === null) return false;
      const min = parseNumero(valor.min);
      const max = parseNumero(valor.max);
      if (min !== null && numero < min) return false;
      if (max !== null && numero > max) return false;
      return true;
    }
    case "texto":
      return (
        definicion.tipo === "texto" && normalizar(definicion.valor(fila)).includes(normalizar(valor.texto.trim()))
      );
  }
}

/** Todos los filtros activos se cumplen a la vez (Y). */
export function filtrarFilas<F>(def: DefTabla<F>, filas: F[], filtros: Filtro[]): F[] {
  const activos = filtros.filter(filtroActivo);
  if (activos.length === 0) return filas;
  return filas.filter((fila) => activos.every((filtro) => coincide(def, fila, filtro)));
}

export const PRESETS_FECHA = [
  { id: "hoy", etiqueta: "Hoy" },
  { id: "7d", etiqueta: "Últimos 7 días" },
  { id: "30d", etiqueta: "Últimos 30 días" },
  { id: "mes_actual", etiqueta: "Este mes" },
  { id: "mes_anterior", etiqueta: "Mes anterior" },
] as const;

export type PresetFechaId = (typeof PRESETS_FECHA)[number]["id"];

const aIso = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

export function rangoDePreset(preset: PresetFechaId, ahora: Date): { desde: string; hasta: string } {
  const anio = ahora.getFullYear();
  const mes = ahora.getMonth();
  const dia = ahora.getDate();
  switch (preset) {
    case "hoy":
      return { desde: aIso(new Date(anio, mes, dia)), hasta: aIso(new Date(anio, mes, dia)) };
    case "7d":
      return { desde: aIso(new Date(anio, mes, dia - 6)), hasta: aIso(new Date(anio, mes, dia)) };
    case "30d":
      return { desde: aIso(new Date(anio, mes, dia - 29)), hasta: aIso(new Date(anio, mes, dia)) };
    case "mes_actual":
      return { desde: aIso(new Date(anio, mes, 1)), hasta: aIso(new Date(anio, mes, dia)) };
    case "mes_anterior":
      return { desde: aIso(new Date(anio, mes - 1, 1)), hasta: aIso(new Date(anio, mes, 0)) };
  }
}

const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

/** Lee filtros guardados descartando cualquier cosa que no tenga la forma esperada para esta tabla. */
export function parsearFiltros<F>(def: DefTabla<F>, json: string): Filtro[] {
  if (json === "") return [];
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];

  const usados = new Set<string>();
  const resultado: Filtro[] = [];
  for (const item of datos) {
    if (typeof item !== "object" || item === null) continue;
    const { campo, valor } = item as { campo?: unknown; valor?: unknown };
    const definicion = typeof campo === "string" ? campoDe(def, campo) : undefined;
    if (!definicion || usados.has(definicion.id) || typeof valor !== "object" || valor === null) continue;
    const v = valor as Record<string, unknown>;

    let filtro: Filtro;
    switch (definicion.tipo) {
      case "seleccion":
        filtro = {
          campo: definicion.id,
          valor: {
            tipo: "seleccion",
            valores: Array.isArray(v.valores) ? v.valores.filter((x): x is string => typeof x === "string") : [],
          },
        };
        break;
      case "fecha":
        filtro = { campo: definicion.id, valor: { tipo: "fecha", desde: texto(v.desde), hasta: texto(v.hasta) } };
        break;
      case "numero":
        filtro = { campo: definicion.id, valor: { tipo: "numero", min: texto(v.min), max: texto(v.max) } };
        break;
      case "texto":
        filtro = { campo: definicion.id, valor: { tipo: "texto", texto: texto(v.texto) } };
        break;
    }
    usados.add(definicion.id);
    resultado.push(filtro);
  }
  return resultado;
}
