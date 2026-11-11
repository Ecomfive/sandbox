// Comparar un Excel del libro contra lo ya cargado de ese mismo archivo, antes de aplicarlo: qué se agrega, qué cambia
// (campo antes → después) y qué está en la base y ya no viene. Lógica pura. Prueba en `comparar-libro.test.ts`.
//
// La huella de cada fila sale de su contenido (`leerLibro`), así que una fila con el monto o la descripción corregidos
// llega como «nueva» y la vieja como «ya no viene». Se emparejan por segunda vez (mismo mes + misma descripción y monto,
// o misma descripción y fecha, o mismo monto, fecha y tienda) para mostrarlas como un cambio.

import { claveCatalogo } from "./libro-excel";
import { normalizar } from "./clasificacion";

export interface FilaComparable {
  clave: string;
  periodo: string;
  fecha_pago: string | null;
  fecha_servicio: string | null;
  tienda: string;
  tipo: string | null;
  descripcion: string;
  monto: number;
  cuenta: string | null;
  en_eerr: boolean;
  en_flujo: boolean;
  factura_numero: string | null;
  ruc_proveedor: string | null;
  /** Solo en la base: corregida a mano (la importación no la toca). */
  editado?: boolean;
}

export interface CampoCambiado {
  campo: string;
  antes: string;
  despues: string;
}

export interface Cambio {
  antes: FilaComparable;
  despues: FilaComparable;
  campos: CampoCambiado[];
  /** Corregida a mano en el portal: el Excel no la va a cambiar. */
  conservado: boolean;
}

export interface Comparacion {
  agrega: FilaComparable[];
  cambia: Cambio[];
  quita: FilaComparable[];
  iguales: number;
}

const CAMPOS: { id: keyof FilaComparable; etiqueta: string; texto: (f: FilaComparable) => string }[] = [
  { id: "periodo", etiqueta: "Mes", texto: (f) => f.periodo.slice(0, 7) },
  { id: "fecha_pago", etiqueta: "Pago", texto: (f) => f.fecha_pago ?? "" },
  { id: "fecha_servicio", etiqueta: "Prestación", texto: (f) => f.fecha_servicio ?? "" },
  { id: "tienda", etiqueta: "Tienda", texto: (f) => f.tienda },
  { id: "tipo", etiqueta: "Tipo", texto: (f) => f.tipo ?? "" },
  { id: "descripcion", etiqueta: "Descripción", texto: (f) => f.descripcion },
  { id: "monto", etiqueta: "Monto", texto: (f) => f.monto.toFixed(2) },
  { id: "cuenta", etiqueta: "Forma de pago", texto: (f) => f.cuenta ?? "" },
  { id: "en_eerr", etiqueta: "EERR", texto: (f) => (f.en_eerr ? "Sí" : "No") },
  { id: "en_flujo", etiqueta: "Flujo", texto: (f) => (f.en_flujo ? "Sí" : "No") },
  { id: "factura_numero", etiqueta: "N° de factura", texto: (f) => f.factura_numero ?? "" },
  { id: "ruc_proveedor", etiqueta: "RUC", texto: (f) => f.ruc_proveedor ?? "" },
];

/** Para comparar textos de catálogo (tienda, tipo, cuenta) como los compara la importación. */
const igual = (id: keyof FilaComparable, a: string, b: string) =>
  id === "tienda" || id === "tipo" || id === "cuenta" ? claveCatalogo(a) === claveCatalogo(b) : id === "descripcion" ? normalizar(a) === normalizar(b) : a === b;

export function camposDistintos(antes: FilaComparable, despues: FilaComparable): CampoCambiado[] {
  const salida: CampoCambiado[] = [];
  for (const c of CAMPOS) {
    const a = c.texto(antes);
    const d = c.texto(despues);
    if (!igual(c.id, a, d)) salida.push({ campo: c.etiqueta, antes: a, despues: d });
  }
  return salida;
}

const desc = (f: FilaComparable) => normalizar(f.descripcion);
const LLAVES: ((f: FilaComparable) => string)[] = [
  (f) => `${f.periodo}|${desc(f)}|${f.monto.toFixed(2)}`,
  (f) => `${f.periodo}|${desc(f)}|${f.fecha_pago ?? ""}`,
  (f) => `${f.periodo}|${f.monto.toFixed(2)}|${f.fecha_pago ?? ""}|${claveCatalogo(f.tienda)}`,
];

export function compararLibro(archivo: FilaComparable[], base: FilaComparable[]): Comparacion {
  const enBase = new Map(base.map((f) => [f.clave, f]));
  const delArchivo = new Set(archivo.map((f) => f.clave));
  const cambia: Cambio[] = [];
  let iguales = 0;
  let nuevas: FilaComparable[] = [];
  for (const f of archivo) {
    const b = enBase.get(f.clave);
    if (!b) {
      nuevas.push(f);
      continue;
    }
    const campos = camposDistintos(b, f);
    if (campos.length) cambia.push({ antes: b, despues: f, campos, conservado: b.editado === true });
    else iguales++;
  }
  let sobran = base.filter((b) => !delArchivo.has(b.clave));
  // Empareja lo nuevo con lo que ya no viene, de la llave más estricta a la más suelta.
  for (const llave of LLAVES) {
    if (!nuevas.length || !sobran.length) break;
    const porLlave = new Map<string, FilaComparable[]>();
    for (const s of sobran) porLlave.set(llave(s), [...(porLlave.get(llave(s)) ?? []), s]);
    const usados = new Set<FilaComparable>();
    const quedan: FilaComparable[] = [];
    for (const f of nuevas) {
      const candidatos = porLlave.get(llave(f));
      const b = candidatos?.shift();
      if (!b) {
        quedan.push(f);
        continue;
      }
      usados.add(b);
      cambia.push({ antes: b, despues: f, campos: camposDistintos(b, f), conservado: b.editado === true });
    }
    nuevas = quedan;
    sobran = sobran.filter((s) => !usados.has(s));
  }
  return { agrega: nuevas, cambia, quita: sobran, iguales };
}
