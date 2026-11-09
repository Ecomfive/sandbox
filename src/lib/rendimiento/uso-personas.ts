// Gestión de IDs Dropi › Uso del sistema, por persona (6 nov 2026, pedido de Hernán): quién usa el sistema, en qué parte y en qué no, para saber qué falta
// para mudarnos. Sale de los minutos activos (`actividad_minutos`, migración 0166), lo guardado (auditoría) y los WhatsApp enviados. Lo que pasa dentro de
// otra plataforma lo manda la extensión «Ecomfive · Uso» (migración 0240): quien no la tiene queda «sin medir», nunca en cero. Sin base ni React, con prueba.

import type { PlataformaExterna } from "./uso-externo";

export const FRENTES_USO = [
  { id: "crm", etiqueta: "CRM", rutas: ["/crm-dropshippers"] },
  { id: "ids-dropi", etiqueta: "IDs Dropi", rutas: ["/publicaciones-dropi"] },
  { id: "ids-drop-effi", etiqueta: "IDs Drop y Effi", rutas: ["/publicaciones-drop", "/publicaciones-effi", "/publicaciones-dunamixfy"] },
  { id: "producto", etiqueta: "Producto", rutas: ["/producto", "/wms-productos", "/wms-productos-dropi", "/productos-test"] },
  { id: "compras", etiqueta: "Compras", rutas: ["/compras", "/portal-proveedor"] },
  { id: "inventario", etiqueta: "Inventario", rutas: ["/inventario", "/wms-bodegas", "/wms-ubicaciones"] },
  { id: "pedidos", etiqueta: "Pedidos y ventas", rutas: ["/pedidos-dropi", "/tienda-pedidos", "/tienda-productos", "/tienda-tiendas", "/tienda-dashboard", "/ventas-dropi", "/ventas-tiendas", "/deliverys"] },
  { id: "finanzas", etiqueta: "Finanzas", rutas: ["/retiros", "/conciliaciones", "/extractos", "/gastos", "/productos", "/panel-financiero"] },
  {
    id: "investigacion",
    etiqueta: "Investigación y testing",
    rutas: ["/analisis-competencia", "/scraping-proveedores", "/tu-winner", "/drop-killer", "/inteligencia-competitiva", "/seleccion-productos", "/creacion-ofertas", "/generador-landings", "/filtro-productos", "/instagram", "/sugerencias-clientes"],
  },
  { id: "general", etiqueta: "General", rutas: [] },
] as const;

export type FrenteUso = (typeof FRENTES_USO)[number]["id"];

/** A qué parte del sistema pertenece una ruta. Mirar esta misma supervisión no cuenta como trabajo en IDs Dropi. */
export function frenteDeRuta(ruta: string): FrenteUso {
  if (ruta.startsWith("/publicaciones-dropi/uso-sistema")) return "general";
  const f = FRENTES_USO.find((x) => (x.rutas as readonly string[]).some((r) => ruta === r || ruta.startsWith(`${r}/`)));
  return f?.id ?? "general";
}

export interface PersonaUso {
  id: string;
  nombre: string;
  email: string;
  avatar: string | null;
  rol: string | null;
  ultimaVez: string | null;
}

export interface MinutosPagina {
  persona: string;
  dia: string;
  frente: FrenteUso;
  pagina: string;
  minutos: number;
}

export interface JornadaDia {
  persona: string;
  dia: string;
  /** Minutos de la primera a la última actividad del día, con pausas. */
  minutos: number;
}

export interface ConteoPersona {
  persona: string;
  dia: string;
  n: number;
}

export interface MinutosExterno {
  persona: string;
  dia: string;
  plataforma: PlataformaExterna;
  seccion: string;
  minutos: number;
}

export interface WhatsappDia {
  numero: string;
  dia: string;
  crm: number;
  celular: number;
}

export interface DatosUsoPersonas {
  personas: PersonaUso[];
  minutos: MinutosPagina[];
  jornadas: JornadaDia[];
  cambios: ConteoPersona[];
  mensajes: ConteoPersona[];
  whatsapp: WhatsappDia[];
  externos: MinutosExterno[];
  /** Quién tiene la extensión puesta. */
  conExtension: string[];
}

export interface FilaPersonaUso extends PersonaUso {
  minutos: number;
  dias: number;
  /** Qué parte de su jornada estuvo activa en el sistema, de 0 a 100; null si no entró. */
  pctDia: number | null;
  cambios: number;
  mensajes: number;
  porFrente: Partial<Record<FrenteUso, number>>;
  paginas: { frente: FrenteUso; pagina: string; minutos: number }[];
  /** Tiene la extensión: sus ceros en otras plataformas son ceros de verdad. */
  midiendo: boolean;
  minutosExterno: number;
  porPlataforma: Partial<Record<PlataformaExterna, number>>;
  /** Qué parte de su tiempo total fue en el sistema; null si no se mide o no hubo tiempo. */
  pctSistema: number | null;
}

export interface SeccionExterna {
  plataforma: PlataformaExterna;
  seccion: string;
  minutos: number;
  personas: string[];
}

export interface ResumenPersonas {
  filas: FilaPersonaUso[];
  usaron: number;
  minutos: number;
  porFrente: { frente: FrenteUso; minutos: number }[];
  whatsapp: { numero: string; crm: number; celular: number }[];
  minutosExterno: number;
  /** Dónde se va el tiempo afuera, de lo que más a lo que menos. */
  secciones: SeccionExterna[];
}

/** Una fecha (AAAA-MM-DD) menos unos días. */
export function restarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Qué parte de un total es algo, de 0 a 100. */
export const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/** Junta lo de cada persona desde un día. Primero quien más tiempo pasó; quien no entró, al final. */
export function resumirPersonas(d: DatosUsoPersonas, desde: string): ResumenPersonas {
  const delPeriodo = <T extends { dia: string }>(l: T[]) => l.filter((x) => x.dia >= desde);
  const sumar = (l: ConteoPersona[], persona: string) => l.filter((x) => x.persona === persona).reduce((t, x) => t + x.n, 0);
  const minutos = delPeriodo(d.minutos);
  const jornadas = delPeriodo(d.jornadas);
  const cambios = delPeriodo(d.cambios);
  const mensajes = delPeriodo(d.mensajes);
  const externos = delPeriodo(d.externos);
  const conExtension = new Set(d.conExtension);

  const filas = d.personas
    .map((p): FilaPersonaUso => {
      const suyos = minutos.filter((m) => m.persona === p.id);
      const total = suyos.reduce((t, m) => t + m.minutos, 0);
      const jornada = jornadas.filter((j) => j.persona === p.id).reduce((t, j) => t + j.minutos, 0);
      const porFrente: Partial<Record<FrenteUso, number>> = {};
      const paginas = new Map<string, { frente: FrenteUso; pagina: string; minutos: number }>();
      for (const m of suyos) {
        porFrente[m.frente] = (porFrente[m.frente] ?? 0) + m.minutos;
        const x = paginas.get(m.pagina) ?? { frente: m.frente, pagina: m.pagina, minutos: 0 };
        x.minutos += m.minutos;
        paginas.set(m.pagina, x);
      }
      const porPlataforma: Partial<Record<PlataformaExterna, number>> = {};
      for (const e of externos) if (e.persona === p.id) porPlataforma[e.plataforma] = (porPlataforma[e.plataforma] ?? 0) + e.minutos;
      const minutosExterno = Object.values(porPlataforma).reduce((t, m) => t + m, 0);
      const midiendo = conExtension.has(p.id);
      return {
        ...p,
        midiendo,
        minutosExterno,
        porPlataforma,
        pctSistema: midiendo && total + minutosExterno > 0 ? pct(total, total + minutosExterno) : null,
        minutos: total,
        dias: new Set(suyos.map((m) => m.dia)).size,
        pctDia: jornada > 0 ? Math.min(100, pct(total, jornada)) : null,
        cambios: sumar(cambios, p.id),
        mensajes: sumar(mensajes, p.id),
        porFrente,
        paginas: [...paginas.values()].sort((a, b) => b.minutos - a.minutos || a.pagina.localeCompare(b.pagina)),
      };
    })
    .sort((a, b) => b.minutos + b.minutosExterno - (a.minutos + a.minutosExterno) || b.cambios - a.cambios || a.nombre.localeCompare(b.nombre));

  const whatsapp = new Map<string, { numero: string; crm: number; celular: number }>();
  for (const w of delPeriodo(d.whatsapp)) {
    const x = whatsapp.get(w.numero) ?? { numero: w.numero, crm: 0, celular: 0 };
    x.crm += w.crm;
    x.celular += w.celular;
    whatsapp.set(w.numero, x);
  }

  const secciones = new Map<string, SeccionExterna>();
  const nombreDe = new Map(d.personas.map((p) => [p.id, p.nombre]));
  for (const e of externos) {
    const k = `${e.plataforma}|${e.seccion}`;
    const x = secciones.get(k) ?? { plataforma: e.plataforma, seccion: e.seccion, minutos: 0, personas: [] };
    x.minutos += e.minutos;
    const nombre = nombreDe.get(e.persona);
    if (nombre && !x.personas.includes(nombre)) x.personas.push(nombre);
    secciones.set(k, x);
  }

  return {
    filas,
    minutosExterno: externos.reduce((t, e) => t + e.minutos, 0),
    secciones: [...secciones.values()].sort((a, b) => b.minutos - a.minutos || a.seccion.localeCompare(b.seccion)),
    usaron: filas.filter((f) => f.minutos > 0).length,
    minutos: filas.reduce((t, f) => t + f.minutos, 0),
    porFrente: FRENTES_USO.map((f) => ({ frente: f.id as FrenteUso, minutos: minutos.filter((m) => m.frente === f.id).reduce((t, m) => t + m.minutos, 0) })),
    whatsapp: [...whatsapp.values()].sort((a, b) => b.crm + b.celular - (a.crm + a.celular)),
  };
}
