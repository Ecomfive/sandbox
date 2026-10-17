// Equipo › Puestos: el organigrama sale de «reporta a» de cada puesto. Lógica pura, con prueba en organigrama.test.ts.

export interface PuestoBase {
  id: string;
  nombre: string;
  area: string;
  reportaA: string | null;
  plazas: number;
  activo: boolean;
}

export interface Ocupante {
  puestoId: string;
  usuarioId: string;
  principal: boolean;
}

export interface Nodo<P extends PuestoBase = PuestoBase> {
  puesto: P;
  hijos: Nodo<P>[];
}

/**
 * Arma el árbol de puestos activos. Un puesto que reporta a uno inactivo, borrado o en un ciclo queda como raíz, para que
 * ninguno se pierda. Hijos y raíces, por área y nombre.
 */
export function armarArbol<P extends PuestoBase>(puestos: P[]): Nodo<P>[] {
  const activos = puestos.filter((p) => p.activo);
  const porId = new Map(activos.map((p) => [p.id, p]));
  const nodos = new Map(activos.map((p) => [p.id, { puesto: p, hijos: [] as Nodo<P>[] }]));
  const raices: Nodo<P>[] = [];
  for (const p of activos) {
    const padre = p.reportaA && porId.has(p.reportaA) && !formaCiclo(p.id, porId) ? nodos.get(p.reportaA) : undefined;
    (padre ? padre.hijos : raices).push(nodos.get(p.id)!);
  }
  const ordenar = (lista: Nodo<P>[]) => {
    lista.sort((a, b) => a.puesto.area.localeCompare(b.puesto.area, "es") || a.puesto.nombre.localeCompare(b.puesto.nombre, "es"));
    for (const n of lista) ordenar(n.hijos);
  };
  ordenar(raices);
  return raices;
}

function formaCiclo(id: string, porId: Map<string, PuestoBase>): boolean {
  const vistos = new Set<string>([id]);
  let actual = porId.get(id)?.reportaA ?? null;
  while (actual) {
    if (vistos.has(actual)) return true;
    vistos.add(actual);
    actual = porId.get(actual)?.reportaA ?? null;
  }
  return false;
}

/** Si poner `reportaA` como jefe de `id` cerraría un ciclo (el nuevo jefe depende, directa o indirectamente, de `id`). */
export function cierraCiclo(id: string, reportaA: string | null, puestos: Pick<PuestoBase, "id" | "reportaA">[]): boolean {
  if (!reportaA) return false;
  if (reportaA === id) return true;
  const padre = new Map(puestos.map((p) => [p.id, p.reportaA]));
  const vistos = new Set<string>();
  let actual: string | null = reportaA;
  while (actual) {
    if (actual === id) return true;
    if (vistos.has(actual)) return false;
    vistos.add(actual);
    actual = padre.get(actual) ?? null;
  }
  return false;
}

/** Cuántas plazas de un puesto siguen libres. */
export function vacantes(puesto: Pick<PuestoBase, "id" | "plazas">, ocupantes: Ocupante[]): number {
  return Math.max(0, puesto.plazas - ocupantes.filter((o) => o.puestoId === puesto.id).length);
}

/**
 * El jefe de una persona: quienes ocupan el puesto al que reporta su puesto principal. Si ese puesto está vacante, se sube
 * al siguiente. Sin puesto principal se usa el primero que tenga. La persona nunca es su propio jefe.
 */
export function jefesDe(usuarioId: string, puestos: PuestoBase[], ocupantes: Ocupante[]): { puestoId: string; usuarioIds: string[] } | null {
  const suyos = ocupantes.filter((o) => o.usuarioId === usuarioId);
  const principal = suyos.find((o) => o.principal) ?? suyos[0];
  if (!principal) return null;
  const porId = new Map(puestos.map((p) => [p.id, p]));
  const vistos = new Set<string>();
  let actual = porId.get(principal.puestoId)?.reportaA ?? null;
  while (actual && !vistos.has(actual)) {
    vistos.add(actual);
    const ids = ocupantes.filter((o) => o.puestoId === actual && o.usuarioId !== usuarioId).map((o) => o.usuarioId);
    if (ids.length > 0) return { puestoId: actual, usuarioIds: [...new Set(ids)] };
    actual = porId.get(actual)?.reportaA ?? null;
  }
  return null;
}

/** Los puestos que reportan directo a estos (para «Mi equipo»). */
export function puestosACargo(puestoIds: string[], puestos: PuestoBase[]): PuestoBase[] {
  const set = new Set(puestoIds);
  return puestos.filter((p) => p.activo && p.reportaA !== null && set.has(p.reportaA) && !set.has(p.id));
}
