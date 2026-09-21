// Los datos que Dropi pide para una cuenta Binance (una billetera USDT): país, banco (la red), tipo y número de
// identificación y número de cuenta (la dirección de la billetera). Sin React, para poder probarlo.

export interface DatosBinance {
  pais: string;
  banco: string;
  tipo_identificacion: string;
  numero_identificacion: string;
  numero_cuenta: string;
}

/** Nombre de cada campo en el formulario: el de la base con el prefijo `binance_`. */
export const CAMPOS_BINANCE = [
  "pais",
  "banco",
  "tipo_identificacion",
  "numero_identificacion",
  "numero_cuenta",
] as const satisfies readonly (keyof DatosBinance)[];

/** Opciones habituales: el país y el tipo de identificación se eligen de la lista; el banco (la red) es texto libre
 * con esta sugerencia. En Dropi se ven PANAMA, USDT(RED=TRC-20) y CE; el resto son las opciones habituales. */
export const PAISES_BINANCE = ["COSTA RICA", "PANAMA"] as const;
export const BANCOS_BINANCE = ["USDT(RED=TRC-20)"] as const;
export const TIPOS_IDENTIFICACION = ["CC", "CE", "NIT", "PP"] as const;

const MAX_LARGO = 200;

/** El país de una cuenta, escrito como lo muestra Dropi: mayúsculas y sin tildes («Panamá» → «PANAMA»). */
export function paisComoEnDropi(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

interface Formulario {
  get(nombre: string): unknown;
}

/**
 * Lee los datos de una cuenta Binance del formulario (los guardados antes con «tipo de cuenta» se quedan sin él al
 * volver a guardar). Piden dato el tipo de identificación (lleva asterisco en Dropi)
 * y el número de cuenta (sin la dirección la cuenta no sirve); el resto puede quedar vacío. Quita los espacios de las
 * puntas y no acepta textos largos: un servidor de acciones es una entrada pública.
 */
export function leerDatosBinance(formulario: Formulario): { datos: DatosBinance } | { error: string } {
  const datos = {} as DatosBinance;
  for (const campo of CAMPOS_BINANCE) {
    const valor = formulario.get(`binance_${campo}`);
    const texto = typeof valor === "string" ? valor.trim() : "";
    if (texto.length > MAX_LARGO) return { error: "Uno de los datos de Binance es demasiado largo." };
    datos[campo] = texto;
  }
  if (datos.tipo_identificacion === "") return { error: "Falta el tipo de identificación." };
  if (datos.numero_cuenta === "") return { error: "Falta el número de cuenta (la dirección de la billetera)." };
  return { datos };
}

/** Lo que se lee como dato guardado en la base (jsonb): solo los campos conocidos y solo texto. */
export function datosBinanceDeLaBase(valor: unknown): DatosBinance | null {
  if (!valor || typeof valor !== "object") return null;
  const origen = valor as Record<string, unknown>;
  const datos = {} as DatosBinance;
  for (const campo of CAMPOS_BINANCE) datos[campo] = typeof origen[campo] === "string" ? (origen[campo] as string) : "";
  return datos;
}
