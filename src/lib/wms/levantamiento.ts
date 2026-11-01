/**
 * Lo que manda la pantalla de levantamiento (conteo físico por bodega) y cómo se revisa antes de llegar a la base
 * (`wms_registrar_conteo`, migración 0214). Lógica pura, con prueba.
 */

export interface LoteContado {
  codigo: string;
  /** Solo hace falta si el lote es nuevo (AAAA-MM-DD). */
  vencimiento: string | null;
  cantidad: number;
}

export type ItemConteo = { sku: string; cantidad: number } | { sku: string; lotes: LoteContado[] };

export const MAX_ITEMS_CONTEO = 3000;
export const MAX_LOTES_POR_PRODUCTO = 50;
const MAX_CANTIDAD = 1_000_000;
const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const entera = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_CANTIDAD ? n : null;
};

/** Revisa y limpia lo contado. Devuelve los ítems listos para la base o el primer error, en palabras. */
export function revisarConteo(items: unknown): { items: ItemConteo[] } | { error: string } {
  if (!Array.isArray(items) || items.length === 0) return { error: "No hay productos contados." };
  if (items.length > MAX_ITEMS_CONTEO) return { error: `Son demasiados productos a la vez (máximo ${MAX_ITEMS_CONTEO}).` };
  const vistos = new Set<string>();
  const limpios: ItemConteo[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") return { error: "Un producto contado no es válido." };
    const o = it as Record<string, unknown>;
    const sku = typeof o.sku === "string" ? o.sku : "";
    if (!ES_ID.test(sku)) return { error: "Un producto contado no es válido." };
    if (vistos.has(sku)) return { error: "Un producto viene dos veces." };
    vistos.add(sku);
    if (Array.isArray(o.lotes)) {
      if (o.lotes.length > MAX_LOTES_POR_PRODUCTO) return { error: "Demasiados lotes en un producto." };
      const codigos = new Set<string>();
      const lotes: LoteContado[] = [];
      for (const l of o.lotes) {
        const x = (l ?? {}) as Record<string, unknown>;
        const codigo = typeof x.codigo === "string" ? x.codigo.replace(/\s+/g, " ").trim().slice(0, 80) : "";
        if (!codigo) return { error: "Falta el código de un lote." };
        const clave = codigo.toLowerCase();
        if (codigos.has(clave)) return { error: `El lote ${codigo} está repetido.` };
        codigos.add(clave);
        const cantidad = entera(x.cantidad);
        if (cantidad === null) return { error: `La cantidad del lote ${codigo} no es válida.` };
        const venc = typeof x.vencimiento === "string" && x.vencimiento ? x.vencimiento : null;
        if (venc && (!FECHA.test(venc) || Number.isNaN(Date.parse(venc)))) return { error: `La fecha del lote ${codigo} no es válida.` };
        lotes.push({ codigo, vencimiento: venc, cantidad });
      }
      limpios.push({ sku, lotes });
    } else {
      const cantidad = entera(o.cantidad);
      if (cantidad === null) return { error: "Una cantidad contada no es válida." };
      limpios.push({ sku, cantidad });
    }
  }
  return { items: limpios };
}

/** La diferencia entre lo contado y lo que dice el sistema (positiva: sobra en el sistema; negativa: falta). */
export const diferencia = (contado: number, enSistema: number) => contado - enSistema;

export interface LineaImportada {
  nombre: string;
  cantidad: number;
}

export const MAX_LINEAS_IMPORTADAS = 2000;

/**
 * Lee una lista pegada o subida (una línea por producto: «nombre o SKU;cantidad», también con tabulador o coma) para cargar
 * lo contado en el levantamiento. La cantidad es lo último de la línea (admite «1,491» o «1.491» como miles). Las líneas sin
 * cantidad (el encabezado) se saltan. Devuelve las líneas leídas y cuántas se saltaron.
 */
export function leerLista(texto: string): { lineas: LineaImportada[]; saltadas: number } {
  const lineas: LineaImportada[] = [];
  let saltadas = 0;
  for (const cruda of texto.replace(/^﻿/, "").split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    const sep = linea.includes("\t") ? "\t" : linea.includes(";") ? ";" : ",";
    const corte = linea.lastIndexOf(sep);
    if (corte <= 0) {
      saltadas++;
      continue;
    }
    const nombre = linea.slice(0, corte).replace(/^"|"$/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
    const cantTexto = linea.slice(corte + 1).replace(/^"|"$/g, "").trim();
    if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(cantTexto) || !nombre) {
      saltadas++;
      continue;
    }
    const cantidad = Number(cantTexto.replace(/[.,]/g, ""));
    if (!Number.isInteger(cantidad) || cantidad > MAX_CANTIDAD) {
      saltadas++;
      continue;
    }
    lineas.push({ nombre, cantidad });
    if (lineas.length >= MAX_LINEAS_IMPORTADAS) break;
  }
  return { lineas, saltadas };
}
