// Tu Winner (pedido de Hernán, 2 nov 2026): lo puro del panel de Testing Lab › Tu Winner, sin base ni red. Tu Winner da, de cada producto ganador de
// Dropi, el stock de cada día de la última semana; las «ventas» de un día son lo que bajó el stock (como las calcula Tu Winner) y, si subió, el proveedor
// reabasteció. Aquí: cómo leer lo que sube el lector (`scripts/tuwinner-navegador.js`), las ventas por día, la foto, qué cambió entre lecturas y cuántos
// días seguidos lleva ganando. Lo usan la carga (`ingerir.ts`), el panel y las pruebas.

export type PaisTuWinner = "PA" | "MX";
export const PAISES_TUWINNER: PaisTuWinner[] = ["PA", "MX"];

/** Un producto tal como lo sube el lector. */
export interface ProductoLeido {
  tw_id: string;
  dropi_id: string;
  nombre: string;
  precio: number | null;
  sugerido: number | null;
  proveedor: string | null;
  proveedor_id: string | null;
  plataforma: string | null;
  categoria: string | null;
  stock: number | null;
  ventas7: number | null;
  imagen_v: number;
  /** [día AAAA-MM-DD, stock]. */
  dias: [string, number][];
}

export interface LecturaTuWinner {
  leido_en: string;
  paises: Partial<Record<PaisTuWinner, ProductoLeido[]>>;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const txt = (v: unknown, max = 300): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Valida lo que subió el lector: solo Panamá y México, productos con ID de Dropi y nombre, días con fecha y stock. Lo que no sirve se descarta. */
export function leerLectura(dato: unknown): LecturaTuWinner | null {
  if (!dato || typeof dato !== "object") return null;
  const d = dato as { leido_en?: unknown; paises?: Record<string, unknown> };
  const paises: LecturaTuWinner["paises"] = {};
  for (const pais of PAISES_TUWINNER) {
    const lista = d.paises?.[pais];
    if (!Array.isArray(lista)) continue;
    const vistos = new Set<string>();
    paises[pais] = lista
      .map((x) => x as Record<string, unknown>)
      .filter((x) => /^\d{1,9}$/.test(String(x.dropi_id ?? "")) && txt(x.nombre) && typeof x.tw_id === "string" && /^[a-z0-9]{5,30}$/i.test(x.tw_id))
      .filter((x) => !vistos.has(String(x.dropi_id)) && !!vistos.add(String(x.dropi_id)))
      .map((x) => ({
        tw_id: String(x.tw_id),
        dropi_id: String(x.dropi_id),
        nombre: txt(x.nombre, 200)!,
        precio: num(x.precio),
        sugerido: num(x.sugerido),
        proveedor: txt(x.proveedor, 120),
        proveedor_id: /^\d{1,9}$/.test(String(x.proveedor_id ?? "")) ? String(x.proveedor_id) : null,
        plataforma: txt(x.plataforma, 60),
        categoria: txt(x.categoria, 120),
        stock: num(x.stock),
        ventas7: num(x.ventas7),
        imagen_v: Math.max(0, Math.trunc(num(x.imagen_v) ?? 0)),
        dias: (Array.isArray(x.dias) ? x.dias : [])
          .filter((e): e is [string, number] => Array.isArray(e) && /^\d{4}-\d{2}-\d{2}$/.test(String(e[0])) && Number.isFinite(Number(e[1])))
          .map((e) => [String(e[0]), Math.trunc(Number(e[1]))] as [string, number])
          .slice(-31),
      }));
  }
  if (!Object.keys(paises).length) return null;
  return { leido_en: typeof d.leido_en === "string" && !Number.isNaN(Date.parse(d.leido_en)) ? d.leido_en : new Date().toISOString(), paises };
}

/** La miniatura del producto en Tu Winner (la misma que muestra su página). */
export function fotoTuWinner(pais: PaisTuWinner, twId: string, version: number): string {
  const sub = pais === "PA" ? "pa" : "mx";
  return `https://${sub}.imgtuwinner.xyz/file/images${pais}/${twId}${version > 0 ? `_${version}` : ""}_thumb.webp`;
}

export interface DiaDeVentas {
  dia: string;
  ventas: number;
  /** Unidades que el proveedor sumó ese día (el stock subió). */
  reabastecio: number;
}

/** Las ventas de cada día (lo que bajó el stock contra el día anterior); si subió, fue un reabastecimiento y no cuenta como venta. Ordena por día. */
export function ventasPorDia(dias: readonly { dia: string; stock: number }[]): DiaDeVentas[] {
  const orden = [...dias].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const salida: DiaDeVentas[] = [];
  for (let i = 1; i < orden.length; i++) {
    const d = orden[i - 1].stock - orden[i].stock;
    salida.push({ dia: orden[i].dia, ventas: Math.max(0, d), reabastecio: Math.max(0, -d) });
  }
  return salida;
}

/** Días seguidos ganando hasta `hoy` (contando hoy), desde `desde`. 0 si no está ganando. */
export function diasGanando(desde: string | null, hoy: string): number {
  if (!desde) return 0;
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Lo que había de un producto antes de esta lectura. */
export interface ProductoAntes {
  dropi_id: string;
  ganador: boolean;
  ganador_desde: string | null;
  precio: number | null;
  proveedor: string | null;
}

export interface EventoNuevo {
  dropi_id: string;
  tipo: "entro" | "salio" | "precio" | "proveedor";
  antes: string | null;
  despues: string | null;
}

/**
 * Qué cambió con esta lectura en un país: los que entraron a los ganadores (o volvieron), los que salieron, y los que cambiaron de precio o de proveedor.
 * También dice desde cuándo gana cada uno: el que ya ganaba conserva su día; el que entra, gana desde `hoy`.
 */
export function cambiosDeLectura(
  antes: readonly ProductoAntes[],
  ahora: readonly ProductoLeido[],
  hoy: string,
): { eventos: EventoNuevo[]; ganadorDesde: Map<string, string>; salieron: string[] } {
  const previo = new Map(antes.map((a) => [a.dropi_id, a]));
  const eventos: EventoNuevo[] = [];
  const ganadorDesde = new Map<string, string>();
  const dia = hoy.slice(0, 10);
  for (const p of ahora) {
    const a = previo.get(p.dropi_id);
    if (a?.ganador && a.ganador_desde) ganadorDesde.set(p.dropi_id, a.ganador_desde);
    else {
      ganadorDesde.set(p.dropi_id, dia);
      eventos.push({ dropi_id: p.dropi_id, tipo: "entro", antes: null, despues: p.ventas7 === null ? null : String(p.ventas7) });
    }
    if (a && a.precio !== null && p.precio !== null && Math.abs(a.precio - p.precio) >= 0.005)
      eventos.push({ dropi_id: p.dropi_id, tipo: "precio", antes: String(a.precio), despues: String(p.precio) });
    if (a && a.proveedor && p.proveedor && a.proveedor !== p.proveedor) eventos.push({ dropi_id: p.dropi_id, tipo: "proveedor", antes: a.proveedor, despues: p.proveedor });
  }
  const siguen = new Set(ahora.map((p) => p.dropi_id));
  const salieron = antes.filter((a) => a.ganador && !siguen.has(a.dropi_id)).map((a) => a.dropi_id);
  for (const id of salieron) eventos.push({ dropi_id: id, tipo: "salio", antes: null, despues: null });
  return { eventos, ganadorDesde, salieron };
}

/** «PRIV-NMN», «PRIVADO 005», «Privado - SM»: el proveedor lo tiene privado para un dropshipper (no se ve qué es). */
export const esPrivado = (nombre: string): boolean => /^\s*priv(ado)?\b|^\s*priv[-\s]/i.test(nombre);

/** Unidades que se le acaban en días al ritmo de la semana (null si no vende). */
export function diasDeStock(stock: number | null, ventas7: number | null): number | null {
  if (stock === null || !ventas7 || ventas7 <= 0) return null;
  return Math.max(0, Math.round(stock / (ventas7 / 7)));
}
