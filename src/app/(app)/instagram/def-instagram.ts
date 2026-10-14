import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

/** Una captura de Instagram: lo que alguien del equipo compartió por mensaje directo con la cuenta de fuentes. */
export interface FilaInstagram {
  id: string;
  /** El N.º de la captura (se muestra IG-0001). */
  numero: number;
  recibidoEn: string;
  remitenteId: string;
  remitenteUsuario: string | null;
  remitenteNombre: string | null;
  tipo: string;
  enlace: string | null;
  titulo: string | null;
  textoMensaje: string | null;
  /** ¿El video ya está copiado en nuestro almacenamiento? */
  tieneVideo: boolean;
  videoBytes: number | null;
  videoError: string | null;
  autorUsuario: string | null;
  megusta: number | null;
  comentarios: number | null;
  vistas: number | null;
  compartidos: number | null;
  /** AAAA-MM-DD: cuándo se publicó en Instagram. */
  fechaPublicacion: string | null;
  /** De dónde salieron las cifras: «vista_previa» (leídas solas de la página pública, dato no oficial) o «manual» (escritas o corregidas por una persona). */
  fuenteCifras: string | null;
  leidoEn: string | null;
  paginaDestino: string | null;
  notas: string | null;
  estado: string;
  /** El aviso de Meta y lo que respondió Instagram al consultar la publicación, en texto, para revisarlos. */
  datosMeta: string | null;
}

export const numeroInstagram = (n: number) => `IG-${String(n).padStart(4, "0")}`;

/** Quién lo compartió, lo más legible que haya: su usuario, su nombre o, si no se pudo consultar, su id de Instagram. */
export const quienEnvio = (f: Pick<FilaInstagram, "remitenteUsuario" | "remitenteNombre" | "remitenteId">) =>
  f.remitenteUsuario ? `@${f.remitenteUsuario}` : f.remitenteNombre || `ID ${f.remitenteId}`;

/** El recorrido de una captura: cae «Nuevo» y se decide si se testea (Por testear) o no (Descartado). */
export const ESTADOS_INSTAGRAM = [
  { valor: "nuevo", etiqueta: "Nuevo", color: "#8D8D8D" },
  { valor: "por_testear", etiqueta: "Por testear", color: "#1bbc9c" },
  { valor: "descartado", etiqueta: "Descartado", color: "#e50000" },
] as const;

export const etiquetaEstadoInstagram = (v: string) => ESTADOS_INSTAGRAM.find((e) => e.valor === v)?.etiqueta ?? v;
export const colorEstadoInstagram = (v: string) => ESTADOS_INSTAGRAM.find((e) => e.valor === v)?.color ?? "#8D8D8D";

export const TIPOS_INSTAGRAM = [
  { valor: "reel", etiqueta: "Reel", color: "#d74c81" },
  { valor: "post", etiqueta: "Publicación", color: "#5f43d1" },
  { valor: "video", etiqueta: "Video", color: "#0880EA" },
  { valor: "otro", etiqueta: "Otro", color: "#8D8D8D" },
] as const;

export const etiquetaTipoInstagram = (v: string) => TIPOS_INSTAGRAM.find((t) => t.valor === v)?.etiqueta ?? v;
export const colorTipoInstagram = (v: string) => TIPOS_INSTAGRAM.find((t) => t.valor === v)?.color ?? "#8D8D8D";

// La fecha en la hora de Panamá y Costa Rica (UTC-5/-6): de noche, la fecha en UTC ya es la de mañana.
const aFecha = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Panama" }).format(new Date(iso));

export const DEF_INSTAGRAM: DefTabla<FilaInstagram> = {
  clave: "instagram",
  campos: [
    { id: "captura", etiqueta: "Captura", tipo: "texto", valor: (f) => `${numeroInstagram(f.numero)} ${f.titulo ?? ""} ${f.textoMensaje ?? ""}` },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => ESTADOS_INSTAGRAM.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS_INSTAGRAM.map((e) => e.valor),
      colorValor: colorEstadoInstagram,
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (f) => [f.tipo],
      opciones: () => TIPOS_INSTAGRAM.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })),
      agrupable: true,
      ordenGrupos: TIPOS_INSTAGRAM.map((t) => t.valor),
      colorValor: colorTipoInstagram,
    },
    { id: "enviadoPor", etiqueta: "Enviado por", tipo: "seleccion", valores: (f) => [quienEnvio(f)], agrupable: true },
    { id: "autor", etiqueta: "Cuenta del video", tipo: "seleccion", valores: (f) => [f.autorUsuario ? `@${f.autorUsuario}` : SIN_VALOR], etiquetaSinValor: "Sin consultar", agrupable: true },
    { id: "recibido", etiqueta: "Recibido", tipo: "fecha", valor: (f) => aFecha(f.recibidoEn) },
    { id: "video", etiqueta: "Video guardado", tipo: "seleccion", valores: (f) => [f.tieneVideo ? "si" : "no"], opciones: () => [{ valor: "si", etiqueta: "Con video" }, { valor: "no", etiqueta: "Sin video" }], agrupable: true },
    { id: "conEnlace", etiqueta: "Enlace de Instagram", tipo: "seleccion", valores: (f) => [f.enlace ? "con" : "sin"], opciones: () => [{ valor: "con", etiqueta: "Con enlace" }, { valor: "sin", etiqueta: "Sin enlace" }], agrupable: true },
    { id: "conDestino", etiqueta: "Página de destino", tipo: "seleccion", valores: (f) => [f.paginaDestino ? "con" : "sin"], opciones: () => [{ valor: "con", etiqueta: "Con página" }, { valor: "sin", etiqueta: "Sin página" }], agrupable: true },
    { id: "megusta", etiqueta: "Me gusta", tipo: "numero", valor: (f) => f.megusta },
    { id: "comentarios", etiqueta: "Comentarios", tipo: "numero", valor: (f) => f.comentarios },
    { id: "vistas", etiqueta: "Vistas", tipo: "numero", valor: (f) => f.vistas },
    { id: "compartidos", etiqueta: "Compartidos", tipo: "numero", valor: (f) => f.compartidos },
    { id: "publicado", etiqueta: "Publicado", tipo: "fecha", valor: (f) => f.fechaPublicacion },
    { id: "notas", etiqueta: "Notas", tipo: "texto", valor: (f) => f.notas ?? "" },
  ],
  csvAntes: [{ etiqueta: "N.º", valor: (f) => numeroInstagram(f.numero) }],
  // Lo descartado se oculta por defecto, como en Selección de productos; el botón lo muestra aparte.
  cerrados: {
    etiqueta: "Descartados",
    esCerrado: (f) => f.estado === "descartado",
    campoEstado: "estado",
    valoresCerrados: ["descartado"],
    ocultosPorDefecto: true,
    exclusivo: true,
  },
  vistaInicial: { agrupar: "estado" },
};
