// Tiendas Shopify › cuántos pedidos del bot de iComfly se han visto en cada tienda (y qué pasó con su nota), para elegir dónde probar «Quitar la nota del bot» y ver cómo va. Lógica pura, con prueba.

export interface FilaNotaBot {
  tienda_id: string | null;
  dominio: string;
  estado: string;
  creado_en: string;
}

export interface ResumenNotasBot {
  /** Pedidos del bot detectados hoy (hora de Panamá) y en los últimos 7 días. */
  hoy: number;
  sieteDias: number;
  /** De los últimos 7 días: a cuántos ya se les quitó la nota y cuántos fallaron. */
  quitadas: number;
  conError: number;
}

/** El momento de hace `dias` días, en ISO (aparte para poder llamarlo desde una página sin que el lint lo tome por una llamada impura durante el dibujo). */
export const haceDias = (dias: number): string => new Date(Date.now() - dias * 86_400_000).toISOString();
export const ahoraMismo = (): Date => new Date();

const diaEnPanama = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** El resumen por tienda (la llave es su id o, si la fila quedó sin tienda, su dominio). */
export function resumirNotasBot(filas: FilaNotaBot[], ahora: Date, tiendas: { id: string; dominio: string | null }[]): Map<string, ResumenNotasBot> {
  const resumen = new Map<string, ResumenNotasBot>();
  const hoy = diaEnPanama(ahora.toISOString());
  const desde = ahora.getTime() - 7 * 86_400_000;
  const idDeDominio = new Map(tiendas.filter((t) => t.dominio).map((t) => [String(t.dominio).toLowerCase(), t.id]));
  for (const t of tiendas) resumen.set(t.id, { hoy: 0, sieteDias: 0, quitadas: 0, conError: 0 });
  for (const f of filas) {
    const id = f.tienda_id ?? idDeDominio.get(f.dominio.toLowerCase());
    const r = id ? resumen.get(id) : undefined;
    if (!r || new Date(f.creado_en).getTime() < desde) continue;
    r.sieteDias++;
    if (diaEnPanama(f.creado_en) === hoy) r.hoy++;
    if (f.estado === "borrada") r.quitadas++;
    if (f.estado === "error") r.conError++;
  }
  return resumen;
}
