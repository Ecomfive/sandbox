// Catálogo único de proveedores: el nombre «crudo» que trae cada movimiento del libro (sacado de su descripción), el
// proveedor canónico al que apunta por sus alias o su RUC, y las sugerencias de unificación («META», «META ADS» y
// «FACEBK» son el mismo). Lógica pura. Prueba en `proveedores.test.ts`.

import { normalizar } from "./clasificacion";
import { palabras, parecidoPalabras } from "./similitud";

/**
 * Palabras de banco que no son el proveedor («COMPRA EN COMERCIO FACEBK» → «FACEBK»). Se quitan solo al principio de
 * la descripción.
 */
const PREFIJOS_BANCO = new Set([
  "COMPRA", "COMERCIO", "PAGO", "PAGOS", "ACH", "TRANSFERENCIA", "TRANSF", "TRF", "TEF", "POS", "DEBITO", "CREDITO", "CARGO",
  "CARGOS", "AUTOMATICO", "RECURRENTE", "BANCA", "LINEA", "WEB", "INTERNET", "IT", "TDC", "TC", "TARJETA", "SUSCRIPCION",
  "FACTURA", "FACT", "ABONO", "DEPOSITO", "RETIRO", "CHEQUE", "CK", "YAPPY", "NEQUI", "ENVIADA", "RECIBIDA", "INTERNACIONAL",
  "INT", "NACIONAL", "OTROS", "OTRO", "BANCO", "VARIOS", "SERVICIO", "SERVICIOS", "MENSUAL", "COBRO",
]);

/**
 * El nombre del proveedor según la descripción del movimiento: sus primeras dos palabras significativas sin números ni
 * palabras de banco. Vacío si no queda nada.
 */
export function proveedorCrudo(descripcion: string): string {
  const p = palabras(descripcion);
  let i = 0;
  while (i < p.length && PREFIJOS_BANCO.has(p[i])) i++;
  const resto = p.slice(i).filter((w) => w.length >= 2);
  return resto.slice(0, 2).join(" ");
}

/** Clave para comparar nombres y alias (mayúsculas, sin acentos ni signos). */
export const claveProveedor = (nombre: string) => normalizar(nombre);

export interface CatalogoProveedores {
  /** Alias normalizados → id del proveedor, del más largo al más corto (el más específico gana). */
  alias: [string, string][];
  /** RUC limpio → id del proveedor. */
  ruc: Map<string, string>;
}

/** Arma el catálogo para buscar: cada proveedor cuenta también con su propio nombre como alias. */
export function armarCatalogo(proveedores: { id: string; nombre: string; ruc?: string | null }[], alias: { proveedor_id: string; alias: string }[]): CatalogoProveedores {
  const mapa = new Map<string, string>();
  for (const p of proveedores) mapa.set(claveProveedor(p.nombre), p.id);
  for (const a of alias) {
    const k = claveProveedor(a.alias);
    if (k.length >= 2) mapa.set(k, a.proveedor_id);
  }
  const ruc = new Map<string, string>();
  for (const p of proveedores) if (p.ruc) ruc.set(p.ruc.toUpperCase().replace(/\s+/g, ""), p.id);
  return { alias: [...mapa].sort((a, b) => b[0].length - a[0].length), ruc };
}

/**
 * El proveedor canónico de un movimiento: por su RUC si lo trae, si no por el alias más largo que aparezca como palabras
 * completas en su descripción. null si ninguno.
 */
export function proveedorDe(mov: { descripcion: string; ruc?: string | null }, cat: CatalogoProveedores): string | null {
  if (mov.ruc) {
    const id = cat.ruc.get(mov.ruc.toUpperCase().replace(/\s+/g, "").replace(/D\.?V\.?.*$/, ""));
    if (id) return id;
  }
  const d = ` ${normalizar(mov.descripcion)} `;
  for (const [alias, id] of cat.alias) if (d.includes(` ${alias} `)) return id;
  return null;
}

/** Familias conocidas: nombres que son el mismo proveedor aunque no se parezcan. */
const FAMILIAS: { nombre: string; claves: string[] }[] = [
  { nombre: "META", claves: ["META", "FACEBOOK", "FACEBK", "FB", "INSTAGRAM", "META ADS", "META PLATFORMS", "FACEBK ADS"] },
  { nombre: "GOOGLE", claves: ["GOOGLE", "GOOGLE ADS", "GSUITE", "GOOGLE WORKSPACE", "GOOGLE CLOUD", "YOUTUBE"] },
  { nombre: "TIKTOK", claves: ["TIKTOK", "TIKTOK ADS", "BYTEDANCE"] },
  { nombre: "AMAZON", claves: ["AMAZON", "AMZN", "AWS", "AMAZON WEB"] },
  { nombre: "SHOPIFY", claves: ["SHOPIFY"] },
];

const familiaDe = (clave: string) => FAMILIAS.find((f) => f.claves.some((c) => clave === c || clave.startsWith(`${c} `)));

export interface NombreDetectado {
  nombre: string;
  veces: number;
  monto: number;
}

export interface GrupoSugerido {
  /** El nombre que se propone como canónico. */
  canonico: string;
  miembros: NombreDetectado[];
  veces: number;
  monto: number;
}

/**
 * Agrupa los nombres detectados que parecen el mismo proveedor: misma familia conocida, uno dentro del otro como
 * palabras («META» ⊂ «META ADS») o letras muy parecidas («FACEBK»/«FACEBOOK»). Solo devuelve los grupos de dos o más.
 */
export function sugerirUnificaciones(nombres: NombreDetectado[], minParecido = 0.72): GrupoSugerido[] {
  const n = nombres.filter((x) => x.nombre.trim());
  const padre = n.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  const unir = (a: number, b: number) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre[rb] = ra;
  };
  const claves = n.map((x) => claveProveedor(x.nombre));
  const pals = claves.map((c) => c.split(" ").filter(Boolean));
  for (let i = 0; i < n.length; i++) {
    for (let j = i + 1; j < n.length; j++) {
      const fi = familiaDe(claves[i]);
      if (fi && fi === familiaDe(claves[j])) {
        unir(i, j);
        continue;
      }
      const [corto, largo] = pals[i].length <= pals[j].length ? [pals[i], pals[j]] : [pals[j], pals[i]];
      const contenido = corto.length > 0 && corto.join(" ").length >= 3 && corto.every((w, k) => largo[k] === w);
      if (contenido || parecidoPalabras(pals[i], pals[j]) >= minParecido) unir(i, j);
    }
  }
  const grupos = new Map<number, NombreDetectado[]>();
  n.forEach((x, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), x]));
  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const ordenados = [...g].sort((a, b) => b.veces - a.veces || a.nombre.length - b.nombre.length);
      const familia = familiaDe(claveProveedor(ordenados[0].nombre));
      return {
        canonico: familia?.nombre ?? ordenados[0].nombre,
        miembros: ordenados,
        veces: g.reduce((a, x) => a + x.veces, 0),
        monto: g.reduce((a, x) => a + x.monto, 0),
      };
    })
    .sort((a, b) => b.monto - a.monto);
}
