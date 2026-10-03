/**
 * Sugerencias para vincular un usuario de una plataforma (Dropi) con un dropshipper. El único dato que comparten es el
 * nombre: la tienda del usuario en la plataforma contra la tienda y el nombre del dropshipper. Se sugiere, no se decide:
 * una persona confirma cada vínculo.
 */

// Palabras que no distinguen una tienda de otra («Aurora Shop» y «Aurora Store» son la misma).
const PALABRAS_COMUNES = new Set([
  "shop", "store", "tienda", "tiendas", "online", "virtual", "oficial", "official", "web", "ventas", "vende", "venta",
  "mx", "pa", "cr", "pty", "panama", "costa", "rica", "mexico", "colombia", "el", "la", "los", "las", "de", "del", "y", "e",
  "the", "and", "mi", "tu", "by", "com", "co", "pty",
]);

export function normalizarNombre(texto: string | null | undefined): string[] {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 0 && !PALABRAS_COMUNES.has(p));
}

function bigramas(texto: string): string[] {
  const t = texto.replace(/ /g, "");
  if (t.length < 2) return t ? [t] : [];
  const r: string[] = [];
  for (let i = 0; i < t.length - 1; i++) r.push(t.slice(i, i + 2));
  return r;
}

/** Qué tan parecidos son dos nombres, de 0 (nada) a 1 (iguales una vez quitadas las palabras comunes). */
export function parecido(a: string | null | undefined, b: string | null | undefined): number {
  const ta = normalizarNombre(a);
  const tb = normalizarNombre(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const ja = ta.join(" ");
  const jb = tb.join(" ");
  if (ja === jb) return 1;

  const sa = new Set(ta);
  const sb = new Set(tb);
  const comunes = [...sa].filter((p) => sb.has(p));
  // Palabras en común (de 3 letras o más): «Diana» en «Diana vende» y en «Diana López».
  const largas = comunes.filter((p) => p.length >= 3);
  const contenido = largas.length / Math.min(sa.size, sb.size);

  // Uno dentro del otro sin espacios: «novalispty» ↔ «Novalis».
  const pa = ja.replace(/ /g, "");
  const pb = jb.replace(/ /g, "");
  const corto = pa.length <= pb.length ? pa : pb;
  const largo = pa.length <= pb.length ? pb : pa;
  const incluido = corto.length >= 4 && largo.includes(corto) ? 0.85 : 0;

  const ba = bigramas(ja);
  const bb = bigramas(jb);
  let dado = 0;
  if (ba.length && bb.length) {
    const restantes = [...bb];
    let iguales = 0;
    for (const g of ba) {
      const i = restantes.indexOf(g);
      if (i >= 0) {
        iguales++;
        restantes.splice(i, 1);
      }
    }
    dado = (2 * iguales) / (ba.length + bb.length);
  }

  return Math.min(1, Math.max(largas.length > 0 ? contenido * 0.9 : 0, incluido, dado * 0.95));
}

export interface DropshipperParaComparar {
  id: string;
  nombre: string;
  tienda: string | null;
}

export interface Candidato {
  dropshipperId: string;
  puntaje: number;
}

/** Piso para mostrar una sugerencia, y desde dónde se considera una coincidencia fuerte. */
export const PUNTAJE_MINIMO = 0.5;
export const PUNTAJE_ALTO = 0.8;

/**
 * Los dropshippers que más se parecen a una tienda de la plataforma, del más al menos parecido. Se compara con la tienda
 * del dropshipper y, un poco menos, con su nombre (hay quien usa su nombre como tienda).
 */
export function sugerirDropshippers(tiendaPlataforma: string | null | undefined, dropshippers: DropshipperParaComparar[], max = 3): Candidato[] {
  if (!tiendaPlataforma) return [];
  return dropshippers
    .map((d) => ({ dropshipperId: d.id, puntaje: Math.max(parecido(tiendaPlataforma, d.tienda), parecido(tiendaPlataforma, d.nombre) * 0.9) }))
    .filter((c) => c.puntaje >= PUNTAJE_MINIMO)
    .sort((x, y) => y.puntaje - x.puntaje)
    .slice(0, max)
    .map((c) => ({ ...c, puntaje: Math.round(c.puntaje * 100) / 100 }));
}
