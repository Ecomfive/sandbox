import { ETIQUETA_ESTADO_DROPI } from "@/lib/dropi/emparejar-retiros";
import { ESTADO_ETIQUETA } from "@/lib/retiros/estados";
import type { FilaRetiro } from "./tabla-retiros";

export const SIN_VALOR = "__sin_valor__";

export { ESTADO_ETIQUETA };

export type TipoCampo = "seleccion" | "fecha" | "numero" | "texto";

export type CampoId =
  | "estado"
  | "plataforma"
  | "destino"
  | "dropi"
  | "asignado"
  | "creacion"
  | "cierre"
  | "limite"
  | "monto"
  | "comision"
  | "arecibir"
  | "recibido"
  | "notas"
  | "soporte";

export interface DefinicionCampo {
  id: CampoId;
  etiqueta: string;
  tipo: TipoCampo;
}

export const CAMPOS: DefinicionCampo[] = [
  { id: "estado", etiqueta: "Estado", tipo: "seleccion" },
  { id: "plataforma", etiqueta: "Plataforma", tipo: "seleccion" },
  { id: "destino", etiqueta: "Destino", tipo: "seleccion" },
  { id: "dropi", etiqueta: "Estado en Dropi", tipo: "seleccion" },
  { id: "asignado", etiqueta: "Persona asignada", tipo: "seleccion" },
  { id: "creacion", etiqueta: "Fecha de creación", tipo: "fecha" },
  { id: "cierre", etiqueta: "Fecha de cierre", tipo: "fecha" },
  { id: "limite", etiqueta: "Fecha límite", tipo: "fecha" },
  { id: "monto", etiqueta: "Monto", tipo: "numero" },
  { id: "comision", etiqueta: "Comisión", tipo: "numero" },
  { id: "arecibir", etiqueta: "A recibir", tipo: "numero" },
  { id: "recibido", etiqueta: "Monto recibido", tipo: "numero" },
  { id: "notas", etiqueta: "Notas", tipo: "texto" },
  { id: "soporte", etiqueta: "N.º de soporte", tipo: "texto" },
];

export const CAMPO_POR_ID = new Map(CAMPOS.map((c) => [c.id, c]));

export type ValorFiltro =
  | { tipo: "seleccion"; valores: string[] }
  | { tipo: "fecha"; desde: string; hasta: string }
  | { tipo: "numero"; min: string; max: string }
  | { tipo: "texto"; texto: string };

export interface Filtro {
  campo: CampoId;
  valor: ValorFiltro;
}

export interface Opcion {
  valor: string;
  etiqueta: string;
}

export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function parseNumero(texto: string): number | null {
  if (texto.trim() === "") return null;
  const numero = Number(texto.replace(",", "."));
  return Number.isNaN(numero) ? null : numero;
}

export function filtroVacio(campo: CampoId): Filtro {
  const tipo = CAMPO_POR_ID.get(campo)!.tipo;
  switch (tipo) {
    case "seleccion":
      return { campo, valor: { tipo, valores: [] } };
    case "fecha":
      return { campo, valor: { tipo, desde: "", hasta: "" } };
    case "numero":
      return { campo, valor: { tipo, min: "", max: "" } };
    case "texto":
      return { campo, valor: { tipo, texto: "" } };
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

export function valoresDeSeleccion(fila: FilaRetiro, campo: CampoId): string[] {
  switch (campo) {
    case "estado":
      return [fila.estado];
    case "plataforma":
      return [fila.plataformaNombre ?? SIN_VALOR];
    case "destino":
      return [fila.destino === "—" ? SIN_VALOR : fila.destino];
    case "dropi":
      return [fila.estadoDropi ?? SIN_VALOR];
    case "asignado":
      return [fila.asignadoNombre ?? SIN_VALOR];
    default:
      return [];
  }
}

const ETIQUETA_SIN_VALOR: Partial<Record<CampoId, string>> = {
  plataforma: "Sin plataforma",
  destino: "Sin destino",
  asignado: "Sin asignar",
};

/** Estado y estado en Dropi tienen valores fijos; el resto se arma con lo que hay en los retiros. */
export function opcionesDeSeleccion(filas: FilaRetiro[], campo: CampoId): Opcion[] {
  if (campo === "estado") {
    return Object.entries(ESTADO_ETIQUETA).map(([valor, etiqueta]) => ({ valor, etiqueta }));
  }
  if (campo === "dropi") {
    return [
      ...Object.entries(ETIQUETA_ESTADO_DROPI).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      { valor: SIN_VALOR, etiqueta: "Sin vincular" },
    ];
  }
  const conocidos = new Set<string>();
  let haySinValor = false;
  for (const fila of filas) {
    for (const valor of valoresDeSeleccion(fila, campo)) {
      if (valor === SIN_VALOR) haySinValor = true;
      else conocidos.add(valor);
    }
  }
  const opciones = [...conocidos].sort((a, b) => a.localeCompare(b)).map((valor) => ({ valor, etiqueta: valor }));
  if (haySinValor) opciones.push({ valor: SIN_VALOR, etiqueta: ETIQUETA_SIN_VALOR[campo] ?? "Sin dato" });
  return opciones;
}

function fechaDeCampo(fila: FilaRetiro, campo: CampoId): string | null {
  if (campo === "creacion") return fila.fecha.slice(0, 10);
  if (campo === "cierre") return fila.fechaCierre?.slice(0, 10) ?? null;
  if (campo === "limite") return fila.fechaLimite?.slice(0, 10) ?? null;
  return null;
}

function numeroDeCampo(fila: FilaRetiro, campo: CampoId): number | null {
  if (campo === "monto") return fila.monto;
  if (campo === "comision") return fila.comision;
  if (campo === "arecibir") return fila.aRecibir;
  if (campo === "recibido") return fila.montoRecibido;
  return null;
}

function textoDeCampo(fila: FilaRetiro, campo: CampoId): string {
  if (campo === "notas") return fila.notas ?? "";
  if (campo === "soporte") return fila.soporteNumero ?? "";
  return "";
}

function coincide(fila: FilaRetiro, filtro: Filtro): boolean {
  const valor = filtro.valor;
  switch (valor.tipo) {
    case "seleccion":
      return valoresDeSeleccion(fila, filtro.campo).some((v) => valor.valores.includes(v));
    case "fecha": {
      const fecha = fechaDeCampo(fila, filtro.campo);
      if (fecha === null) return false;
      if (valor.desde !== "" && fecha < valor.desde) return false;
      if (valor.hasta !== "" && fecha > valor.hasta) return false;
      return true;
    }
    case "numero": {
      const numero = numeroDeCampo(fila, filtro.campo);
      if (numero === null) return false;
      const min = parseNumero(valor.min);
      const max = parseNumero(valor.max);
      if (min !== null && numero < min) return false;
      if (max !== null && numero > max) return false;
      return true;
    }
    case "texto":
      return normalizar(textoDeCampo(fila, filtro.campo)).includes(normalizar(valor.texto.trim()));
  }
}

/** Todos los filtros activos se cumplen a la vez (Y). */
export function filtrarRetiros(filas: FilaRetiro[], filtros: Filtro[]): FilaRetiro[] {
  const activos = filtros.filter(filtroActivo);
  if (activos.length === 0) return filas;
  return filas.filter((fila) => activos.every((filtro) => coincide(fila, filtro)));
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

/** Lee filtros guardados descartando cualquier cosa que no tenga la forma esperada. */
export function parsearFiltros(json: string): Filtro[] {
  if (json === "") return [];
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];

  const usados = new Set<CampoId>();
  const resultado: Filtro[] = [];
  for (const item of datos) {
    if (typeof item !== "object" || item === null) continue;
    const { campo, valor } = item as { campo?: unknown; valor?: unknown };
    const definicion = typeof campo === "string" ? CAMPO_POR_ID.get(campo as CampoId) : undefined;
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
