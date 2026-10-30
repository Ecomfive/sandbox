/**
 * Fase 4 del panel de Dirección (30 oct 2026, automatizar): la efectividad de entrega, los dropshippers que parecen duplicados y los pasos de la
 * secuencia de alta. Lógica pura: se prueba en automatizar.test.ts.
 */

// ---------------------------------------------------------------------------------------------------------------------------------------
// Efectividad de entrega
// ---------------------------------------------------------------------------------------------------------------------------------------

/** Lo que devuelve `crm_entregas` (migración 0204): una fila por dropshipper y transportadora. */
export interface FilaEntregas {
  dropshipperId: string | null;
  transportadora: string;
  pedidos: number;
  entregados: number;
  devueltos: number;
  cancelados: number;
  novedades: number;
  enCamino: number;
}

export interface Entregas {
  pedidos: number;
  entregados: number;
  devueltos: number;
  cancelados: number;
  novedades: number;
  enCamino: number;
  /** Entregados ÷ (entregados + devueltos); null sin pedidos cerrados. */
  tasa: number | null;
}

/** Con menos pedidos cerrados (entregados + devueltos) la tasa no se juzga: puede ser casualidad. */
export const MIN_CERRADOS = 10;
/** 80 % o más entregados: bien; de 65 a 79 %: atención; menos: mal. */
export const TASA_BUENA = 0.8;
export const TASA_REGULAR = 0.65;

export function sumarEntregas(filas: Omit<FilaEntregas, "dropshipperId" | "transportadora">[]): Entregas {
  const s = { pedidos: 0, entregados: 0, devueltos: 0, cancelados: 0, novedades: 0, enCamino: 0 };
  for (const f of filas) {
    s.pedidos += f.pedidos;
    s.entregados += f.entregados;
    s.devueltos += f.devueltos;
    s.cancelados += f.cancelados;
    s.novedades += f.novedades;
    s.enCamino += f.enCamino;
  }
  const cerrados = s.entregados + s.devueltos;
  return { ...s, tasa: cerrados ? s.entregados / cerrados : null };
}

export type TonoEntrega = "exito" | "aviso" | "peligro" | "neutro";
export function tonoEntrega(e: Entregas): TonoEntrega {
  if (e.tasa === null || e.entregados + e.devueltos < MIN_CERRADOS) return "neutro";
  return e.tasa >= TASA_BUENA ? "exito" : e.tasa >= TASA_REGULAR ? "aviso" : "peligro";
}

/** Agrupa por una clave (dropshipper o transportadora) y suma cada grupo. */
export function entregasPor(filas: FilaEntregas[], clave: (f: FilaEntregas) => string | null): Map<string, Entregas & { principal: string }> {
  const grupos = new Map<string, FilaEntregas[]>();
  for (const f of filas) {
    const k = clave(f);
    if (k === null) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return new Map(
    [...grupos.entries()].map(([k, fs]) => [k, { ...sumarEntregas(fs), principal: [...fs].sort((a, b) => b.pedidos - a.pedidos)[0].transportadora }]),
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------------------------------------------------------------------

export interface DropshipperDatos {
  id: string;
  nombre: string;
  telefono: string | null;
  telefonoAlterno: string | null;
  correo: string | null;
  /** Nombres de sus tiendas (de sus cuentas de Dropi y de «tiendas»). */
  tiendas: string[];
}

export type MotivoDuplicado = "telefono" | "correo" | "nombre" | "tienda";
export const ETIQUETA_MOTIVO: Record<MotivoDuplicado, string> = { telefono: "Mismo WhatsApp", correo: "Mismo correo", nombre: "Mismo nombre", tienda: "Misma tienda" };

export interface GrupoDuplicado {
  motivos: MotivoDuplicado[];
  ids: string[];
}

const normalizarTexto = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Los últimos 8 dígitos: el mismo número con o sin código de país. */
const normalizarTelefono = (s: string | null) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-8) : null;
};

/**
 * Los dropshippers que parecen la misma persona: mismo WhatsApp (principal o alterno, sin mirar el código de país), mismo correo, mismo nombre
 * (sin tildes, mayúsculas ni signos) o misma tienda. Une los grupos que comparten a alguien y dice por qué. Nombres de menos de 4 letras no cuentan.
 */
export function buscarDuplicados(ds: DropshipperDatos[]): GrupoDuplicado[] {
  const padre = new Map(ds.map((d) => [d.id, d.id]));
  const raiz = (x: string): string => {
    let r = x;
    while (padre.get(r) !== r) r = padre.get(r)!;
    padre.set(x, r);
    return r;
  };
  const motivosDe = new Map<string, Set<MotivoDuplicado>>();
  const porClave = new Map<string, string[]>();
  const agregar = (motivo: MotivoDuplicado, valor: string | null, id: string) => {
    if (!valor) return;
    const k = `${motivo}:${valor}`;
    porClave.set(k, [...new Set([...(porClave.get(k) ?? []), id])]);
  };
  for (const d of ds) {
    agregar("telefono", normalizarTelefono(d.telefono), d.id);
    agregar("telefono", normalizarTelefono(d.telefonoAlterno), d.id);
    agregar("correo", d.correo?.trim().toLowerCase() || null, d.id);
    const n = normalizarTexto(d.nombre);
    agregar("nombre", n.replace(/\s/g, "").length >= 4 ? n : null, d.id);
    for (const t of d.tiendas) {
      const nt = normalizarTexto(t);
      agregar("tienda", nt.replace(/\s/g, "").length >= 4 ? nt : null, d.id);
    }
  }
  const unidos: [string[], MotivoDuplicado][] = [];
  for (const [k, ids] of porClave) if (ids.length > 1) unidos.push([ids, k.split(":")[0] as MotivoDuplicado]);
  for (const [ids] of unidos) for (const id of ids.slice(1)) padre.set(raiz(id), raiz(ids[0]));
  for (const [ids, motivo] of unidos) {
    const r = raiz(ids[0]);
    motivosDe.set(r, (motivosDe.get(r) ?? new Set()).add(motivo));
  }
  const grupos = new Map<string, string[]>();
  for (const d of ds) {
    const r = raiz(d.id);
    if (motivosDe.has(r)) grupos.set(r, [...(grupos.get(r) ?? []), d.id]);
  }
  const orden: MotivoDuplicado[] = ["telefono", "correo", "tienda", "nombre"];
  return [...grupos.entries()]
    .map(([r, ids]) => ({ ids, motivos: orden.filter((m) => motivosDe.get(r)!.has(m)) }))
    .sort((a, b) => orden.indexOf(a.motivos[0]) - orden.indexOf(b.motivos[0]) || b.ids.length - a.ids.length);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Secuencia de alta
// ---------------------------------------------------------------------------------------------------------------------------------------

export const PASOS_ALTA: { dia: 1 | 3 | 7 | 14; titulo: string; detalle: string }[] = [
  { dia: 1, titulo: "Bienvenida", detalle: "Darle la bienvenida, contarle cómo funciona y ayudarle a elegir su primer producto." },
  { dia: 3, titulo: "¿Ya publicó?", detalle: "Preguntarle si ya publicó su primer producto y resolver dudas de la tienda o de los anuncios." },
  { dia: 7, titulo: "Primera campaña", detalle: "Acompañarle en su primera campaña: producto, precio, anuncio y cómo confirmar pedidos." },
  { dia: 14, titulo: "¿Por qué no ha pedido?", detalle: "Averiguar qué le frena y ofrecerle un producto ganador con stock." },
];

/**
 * Qué paso de la secuencia toca crear hoy a un dropshipper: el más nuevo que ya venció y no se creó. Los anteriores que tampoco se crearon se
 * dan por saltados (no se manda una pila de tareas si el sistema no corrió unos días). Con su primer pedido, o pasados 20 días, ninguno.
 */
export function pasoDeHoy(diasDesdeAlta: number, hechos: number[], tienePedido: boolean): { crear: number | null; saltar: number[] } {
  if (tienePedido || diasDesdeAlta < 1 || diasDesdeAlta > 20) return { crear: null, saltar: [] };
  const vencidos = PASOS_ALTA.map((p) => p.dia).filter((d) => d <= diasDesdeAlta && !hechos.includes(d));
  if (!vencidos.length) return { crear: null, saltar: [] };
  return { crear: vencidos[vencidos.length - 1], saltar: vencidos.slice(0, -1) };
}
