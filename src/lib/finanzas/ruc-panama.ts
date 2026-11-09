// RUC y dígito verificador (DV) de Panamá. Lógica pura: valida el formato de cada tipo de RUC (persona natural con o sin
// letra —E, PE, N, AV, PI—, NT, persona jurídica y jurídica NT) y calcula el DV con el algoritmo del documento
// «Cálculo Dígito Verificador RUC» de la DGI (módulo 11 sobre el RUC llevado a 20 cifras, dos veces). Adaptado de
// panama-ruc-dv-calculator (MIT, J. Corradine). Las fincas no tienen DV determinable aquí. Prueba en `ruc-panama.test.ts`.

export type TipoRuc =
  | "natural"
  | "extranjero"
  | "panameno-extranjero"
  | "naturalizado"
  | "antes-vigencia"
  | "indigena"
  | "natural-nt"
  | "juridica"
  | "juridica-nt";

export const NOMBRE_TIPO_RUC: Record<TipoRuc, string> = {
  natural: "Persona natural",
  extranjero: "Extranjero (E)",
  "panameno-extranjero": "Panameño nacido en el extranjero (PE)",
  naturalizado: "Naturalizado (N)",
  "antes-vigencia": "Antes de la vigencia (AV)",
  indigena: "Panameño indígena (PI)",
  "natural-nt": "Persona natural NT",
  juridica: "Persona jurídica",
  "juridica-nt": "Persona jurídica NT",
};

/** Un dígito con el peso de la DGI: suma ponderada de derecha a izquierda (pesos 2, 3, 4…) módulo 11. */
function digito(ructb: string, antiguo: boolean): string {
  let j = 2;
  let suma = 0;
  for (let i = ructb.length - 1; i >= 0; i--) {
    if (antiguo && j === 12) {
      antiguo = false;
      j -= 1;
    }
    suma += j * (ructb.charCodeAt(i) - 48);
    j++;
  }
  const r = suma % 11;
  return r > 1 ? String(11 - r) : "0";
}

const dosDigitos = (ructb: string, antiguo = false) => {
  const d1 = digito(ructb, antiguo);
  return d1 + digito(ructb + d1, antiguo);
};

const z = (s: string, n: number) => s.padStart(n, "0");
const PROVINCIAS = new Set(["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"]);
const provincia = (s: string) => (/^\d{1,2}$/.test(s) && PROVINCIAS.has(z(s, 2)) ? z(s, 2) : null);

/** Referencia cruzada de los RUC jurídicos antiguos (tomo con «00» y tercera cifra menor a 5). */
const CRUCE_ANTIGUO: Record<string, string> = {
  "00": "00", "10": "01", "11": "02", "12": "03", "13": "04", "14": "05", "15": "06", "16": "07", "17": "08", "18": "09",
  "19": "01", "20": "02", "21": "03", "22": "04", "23": "07", "24": "08", "25": "09", "26": "02", "27": "03", "28": "04",
  "29": "05", "30": "06", "31": "07", "32": "08", "33": "09", "34": "01", "35": "02", "36": "03", "37": "04", "38": "05",
  "39": "06", "40": "07", "41": "08", "42": "09", "43": "01", "44": "02", "45": "03", "46": "04", "47": "05", "48": "06",
  "49": "07",
};

const LETRAS: Record<string, { tipo: TipoRuc; codigo: string; validacion: string }> = {
  E: { tipo: "extranjero", codigo: "5", validacion: "66" },
  PE: { tipo: "panameno-extranjero", codigo: "75", validacion: "82" },
  N: { tipo: "naturalizado", codigo: "4", validacion: "92" },
  AV: { tipo: "antes-vigencia", codigo: "15", validacion: "9595" },
  PI: { tipo: "indigena", codigo: "79", validacion: "9595" },
};

export interface RucAnalizado {
  valido: boolean;
  tipo: TipoRuc | null;
  /** El RUC limpio (mayúsculas, sin espacios ni el DV). */
  ruc: string;
  /** El DV calculado (dos cifras), o null si el formato no es válido. */
  dv: string | null;
  /** Todos los DV posibles (un RUC NT puede ser de persona natural o jurídica: valen los dos). */
  dvs: string[];
  error: string | null;
}

const invalido = (ruc: string, error: string): RucAnalizado => ({ valido: false, tipo: null, ruc, dv: null, dvs: [], error });
const ok = (ruc: string, tipo: TipoRuc, ructb: string, antiguo = false): RucAnalizado => {
  const dv = dosDigitos(ructb, antiguo);
  return { valido: true, tipo, ruc, dv, dvs: [dv], error: null };
};

/** Separa el DV si viene pegado al RUC: «155-1-2 DV 45», «155-1-2 D.V. 45», «8-1-2 dv45». */
export function separarDv(texto: string): { ruc: string; dv: string | null } {
  const t = String(texto ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const m = /^(.*?)[\s-]*D\.?\s?V\.?\s*:?\s*(\d{1,2})$/.exec(t);
  return m ? { ruc: m[1].trim(), dv: z(m[2], 2) } : { ruc: t, dv: null };
}

/** Reconoce el tipo de RUC y calcula su DV. No consulta a la DGI: dice si el formato es válido y qué DV le toca. */
export function analizarRuc(entrada: string): RucAnalizado {
  const ruc = String(entrada ?? "").toUpperCase().replace(/\s+/g, "");
  if (!ruc) return invalido(ruc, "Vacío.");
  const partes = ruc.split("-");
  if (partes.some((p) => p === "")) return invalido(ruc, "Formato inválido.");

  // NT: provincia-NT-folio-asiento (natural hasta 6 cifras de asiento; jurídica hasta 7).
  if (partes.length === 4 && partes[1] === "NT") {
    const prov = provincia(partes[0]);
    const [, , folio, asiento] = partes;
    if (!prov || !/^\d{1,3}$/.test(folio) || !/^\d{1,7}$/.test(asiento)) return invalido(ruc, "Formato NT inválido (provincia-NT-folio-asiento).");
    // Jurídica NT: con 6 cifras de asiento se usan las 6; si no, las primeras 5.
    const juridica = dosDigitos(asiento.length === 6 ? `${z("", 7)}${prov}43${z(folio, 3)}${asiento}` : `${z("", 8)}${prov}43${z(folio, 3)}${z(asiento.slice(0, 5), 5)}`);
    if (asiento.length <= 6) {
      // Puede ser natural o jurídica NT: el formato no lo dice, así que valen los dos DV.
      const natural = dosDigitos(asiento.length <= 5 ? `${z("", 7)}5${prov}43${z(folio, 3)}${z(asiento, 5)}` : `${z("", 6)}5${prov}43${z(folio, 3)}${z(asiento, 6)}`);
      return { valido: true, tipo: "natural-nt", ruc, dv: natural, dvs: [...new Set([natural, juridica])], error: null };
    }
    return { valido: true, tipo: "juridica-nt", ruc, dv: juridica, dvs: [juridica], error: null };
  }

  if (partes.length !== 3) return invalido(ruc, "Formato inválido: se esperan tres partes separadas por guiones.");
  const [a, folio, asiento] = partes;

  // Natural con letra al principio: E-folio-asiento, PE-…, N-…
  if (a === "E" || a === "PE" || a === "N") {
    const l = LETRAS[a];
    if (!/^\d{1,4}$/.test(folio) || !/^\d{1,9}$/.test(asiento)) return invalido(ruc, "Formato inválido (letra-folio-asiento).");
    const seis = asiento.length === 6 && (a === "E" || a === "N");
    let ructb: string;
    if (folio.length < 4) ructb = `5${"00"}${l.codigo.padEnd(2, "0")}${z(folio, 3)}${seis ? asiento : z(asiento.slice(0, 5), 5)}`;
    else if (seis) ructb = `5${l.validacion}${l.codigo.padEnd(2, "0")}${z(folio, 4)}${asiento}`;
    else ructb = `5${l.validacion}${l.codigo}${z(folio, 4)}${z(asiento.slice(0, 5), 5)}`;
    return ok(ruc, l.tipo, z(ructb, 20));
  }

  // Natural AV o PI: provincia+letras («8AV», «2PI»)-folio-asiento.
  const avpi = /^(\d{1,2})(AV|PI)$/.exec(a);
  if (avpi) {
    const prov = provincia(avpi[1]);
    const l = LETRAS[avpi[2]];
    if (!prov || !/^\d{1,4}$/.test(folio) || !/^\d{1,8}$/.test(asiento)) return invalido(ruc, "Formato inválido (provincia AV/PI-folio-asiento).");
    const ructb = folio.length < 4 ? `5${prov}${l.codigo}${z(folio, 3)}${z(asiento.slice(0, 5), 5)}` : `5${l.validacion}${z(folio, 4)}${z(asiento.slice(0, 5), 5)}`;
    return ok(ruc, l.tipo, z(ructb, 20));
  }

  if (!/^\d+$/.test(a) || !/^\d+$/.test(folio) || !/^\d+$/.test(asiento)) return invalido(ruc, "Formato inválido: solo cifras y guiones (o la letra del tipo).");

  // Natural: provincia (1 o 2 cifras, 0 a 13)-folio (hasta 4)-asiento (hasta 9).
  const juridica = (): string | null => {
    if (a.length > 9 || folio.length > 4 || asiento.length > 6) return null;
    let ructb = `${z(a, 10)}${z(folio, 4)}${z(asiento, 6)}`;
    const antiguo = ructb[3] === "0" && ructb[4] === "0" && ructb[5] < "5";
    if (antiguo) ructb = ructb.slice(0, 5) + (CRUCE_ANTIGUO[ructb.slice(5, 7)] ?? ructb.slice(5, 7)) + ructb.slice(7);
    return dosDigitos(ructb, antiguo);
  };
  if (a.length <= 2 && provincia(a) && folio.length <= 4 && asiento.length <= 9) {
    const natural = ok(ruc, "natural", z(`5${provincia(a)}00${z(folio, 3)}${z(asiento.slice(0, 5), 5)}`, 20));
    // Un tomo de una o dos cifras también puede ser de una sociedad vieja: su DV también vale.
    const j = juridica();
    return j ? { ...natural, dvs: [...new Set([natural.dv!, j])] } : natural;
  }

  // Jurídica: tomo/rollo (hasta 9)-folio/imagen (hasta 4)-asiento/ficha (hasta 6).
  const dv = juridica();
  if (!dv) return invalido(ruc, "Formato de persona jurídica inválido (tomo-folio-asiento).");
  return { valido: true, tipo: "juridica", ruc, dv, dvs: [dv], error: null };
}

export interface ValidacionRuc {
  /** El RUC limpio y el DV (el escrito o, si no se escribió, el calculado). */
  ruc: string;
  dv: string | null;
  tipo: TipoRuc | null;
  error: string | null;
}

/**
 * Valida lo que se captura en un formulario: el RUC (con o sin el DV pegado) y el DV aparte. Vacío es válido (no todo
 * proveedor es panameño). Con un DV escrito que no coincide con el calculado, devuelve el error con el que corresponde.
 */
export function validarRucDv(rucTexto: string, dvTexto = ""): ValidacionRuc {
  const sep = separarDv(rucTexto);
  if (!sep.ruc) return { ruc: "", dv: null, tipo: null, error: null };
  const r = analizarRuc(sep.ruc);
  if (!r.valido) return { ruc: r.ruc, dv: null, tipo: null, error: r.error };
  const escrito = (String(dvTexto ?? "").replace(/\D/g, "") || sep.dv || "").trim();
  if (escrito && !r.dvs.includes(z(escrito, 2))) return { ruc: r.ruc, dv: z(escrito, 2), tipo: r.tipo, error: `El DV no coincide: para este RUC es ${r.dv}.` };
  return { ruc: r.ruc, dv: escrito ? z(escrito, 2) : r.dv, tipo: r.tipo, error: null };
}
