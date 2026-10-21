// Gestión de IDs Dropi (21 oct 2026): las opciones de cada campo (con los colores de ClickUp) y cómo se lee una tarea
// de la lista «GCC 🇵🇦 Ecomfive Panamá». Sin base ni React, para poder probarlo. Tabla `dropi_publicaciones` (migración 0116).

export interface OpcionPublicacion {
  valor: string;
  etiqueta: string;
  color: string;
  /** Cómo se llamaba en ClickUp (para importar). */
  clickup: string;
}

const op = (valor: string, etiqueta: string, color: string, clickup = etiqueta): OpcionPublicacion => ({ valor, etiqueta, color, clickup });

/** El flujo de trabajo, en orden (los estados de la lista de ClickUp). «Archivado» es el que se oculta. */
export const ESTADOS = [
  op("producto_nuevo", "Producto nuevo", "#12a594"),
  op("revisar_precio", "Revisar precio y venta", "#ffc53d", "revisar precio & venta"),
  op("verificar_dropshipper", "Verificar con dropshipper", "#e5484d"),
  op("validar_bajar_precio", "Validar bajar precio", "#f76808"),
  op("bajar_precio", "Bajar precio", "#0091ff"),
  op("al_dia", "Al día", "#30a46c", "al dia"),
  op("archivado", "Archivado", "#8d8d8d"),
];
export const ESTADOS_PUBLICACION = [
  op("activo", "Activo", "#30a46c"),
  op("en_espera", "En espera de aprobación", "#b6b6ff", "En espera de aprobacion"),
  op("archivado", "Archivado", "#8d8d8d"),
  op("eliminado", "Eliminado", "#cecece"),
  op("descartado", "Descartado", "#e5484d"),
];
export const TIPOS = [op("publico", "Público", "#0091ff", "Publico"), op("privado", "Privado", "#e5484d")];
export const ESTADOS_VENTA = [
  op("mas_vendidos", "Más vendidos (+500)", "#30a46c", "Más Vendidos✅ +500"),
  op("estable", "Estable (+100)", "#12a594", "Estable💵 +100"),
  op("lento", "Lento (20 a 99)", "#9a9a9a", "Lento🐌 20 a 99"),
  op("estancado", "Estancado (1 a 20)", "#e5484d", "Estancado 1 a 20"),
  op("sin_stock", "Sin stock", "#f76808", "Sin Stock😓"),
];
export const UBICACIONES = [
  op("bodega_dropi", "Bodega Dropi", "#d9a200", "Bodega Dropi"),
  op("bodega_ecomfive", "Bodega Ecomfive", "#e5484d"),
  op("marketfull", "Marketfull", "#8080e0"),
  op("boxful", "Boxful", "#6f8fe0", "Boxful/DROP"),
  op("bodega_effi", "Bodega Effi", "#4f9ed9"),
  op("dunamixfy", "DunamixFY", "#a8877a"),
];
export const ESTADOS_REPOSICION = [
  op("seguir_pidiendo", "Seguir pidiendo", "#12a594", "Seguir Pidiendo"),
  op("solicitud", "Solicitud de reposición", "#d9a200", "Solicitud de Reposición"),
  op("esperando_stock", "Esperando stock", "#8080e0", "Esperando Stock"),
  op("precaucion", "Precaución", "#f76808"),
  op("no_pedir_mas", "No pedir más", "#e5484d"),
];

export const opcion = (lista: OpcionPublicacion[], valor: string | null | undefined) => lista.find((o) => o.valor === valor);
export const etiqueta = (lista: OpcionPublicacion[], valor: string | null | undefined) => opcion(lista, valor)?.etiqueta ?? valor ?? "—";

/** El correlativo propio de una publicación (migración 0123), distinto al ID de Dropi: «PUB-0012». Sin la migración, «—». */
export const numeroPublicacion = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : `PUB-${String(n).padStart(4, "0")}`);

/** Margen bajo el que se marca con un punto rojo (30 %). */
export const MARGEN_BAJO = 0.3;
/** El margen está por debajo del mínimo (sin margen calculado no cuenta). */
export const margenBajo = (margen: number | null): boolean => margen !== null && margen < MARGEN_BAJO;
/** Días entre revisiones (la próxima revisión = la última + 28, como la fecha límite de ClickUp). */
export const DIAS_REVISION = 28;

/** Los IDs de Dropi que trae el campo («7231-7679» son dos). */
export function idsDropi(texto: string | null | undefined): number[] {
  return String(texto ?? "")
    .split(/[^0-9]+/)
    .filter((x) => x.length >= 2)
    .map(Number);
}

/** La revisión está vencida: ya pasó la próxima revisión (o nunca se revisó) y la publicación no está archivada. */
export function revisionVencida(fila: { estado: string; proximaRevision: string | null }, hoy: string): boolean {
  if (fila.estado === "archivado") return false;
  return !fila.proximaRevision || fila.proximaRevision < hoy;
}

// --- Importar desde ClickUp ----------------------------------------------------------------------------------------

interface CampoClickup {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: { options?: { id: string; name?: string; label?: string; orderindex?: number }[] };
}
export interface TareaClickup {
  id: string;
  name: string;
  status: { status: string };
  description?: string | null;
  markdown_description?: string | null;
  assignees: { id: number; username: string; email: string }[];
  custom_fields: CampoClickup[];
  date_created: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}+ ]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** El valor del sistema para lo que decía ClickUp (sin importar acentos, emojis ni espacios de más). */
export function deClickup(lista: OpcionPublicacion[], texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = norm(texto);
  return lista.find((o) => norm(o.clickup) === t || norm(o.etiqueta) === t)?.valor ?? null;
}

function textoCampo(c: CampoClickup | undefined): string | null {
  if (!c || c.value === undefined || c.value === null || c.value === "") return null;
  if (c.type === "drop_down") {
    const o = c.type_config?.options?.find((x) => x.id === c.value || x.orderindex === c.value);
    return (o?.name ?? String(c.value)).trim() || null;
  }
  return String(c.value).trim() || null;
}
const numero = (c: CampoClickup | undefined) => {
  const t = textoCampo(c);
  const n = t === null ? NaN : Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const fecha = (c: CampoClickup | undefined) => {
  const t = textoCampo(c);
  return t && /^\d+$/.test(t) ? new Date(Number(t)).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) : null;
};

export interface PublicacionImportada {
  nombre: string;
  dropi_id: string | null;
  estado: string;
  estado_publicacion: string | null;
  tipo_publicacion: string | null;
  privatizado_a: string | null;
  privatizado_email: string | null;
  precio_venta: number | null;
  costo_mercancia: number | null;
  fulfillment: number | null;
  coste_real: number | null;
  estado_venta: string | null;
  ubicacion: string | null;
  estado_reposicion: string | null;
  competencia: boolean | null;
  fecha_publicacion: string | null;
  ultima_revision: string | null;
  ultimo_cambio_precio: string | null;
  notas: string | null;
  /** Las tareas relacionadas (ids de ClickUp), para enlazarlas después de importar todas. */
  relacionadosClickup: string[];
  /** La foto (adjunto del campo «Image»). */
  foto: { url: string; nombre: string } | null;
  /** Correos de los responsables, para buscarlos en Usuarios. */
  responsables: string[];
  /** Lo que no calzó con ninguna opción (para avisarlo al importar). */
  avisos: string[];
}

/** Lee una tarea de la lista GCC de ClickUp. Lo que no reconoce lo anota en `avisos` (y queda en `clickup`). */
export function leerTareaGcc(t: TareaClickup): PublicacionImportada {
  const c = (nombre: string) => t.custom_fields.find((x) => x.name.trim() === nombre);
  const avisos: string[] = [];
  const elegir = (lista: OpcionPublicacion[], campo: string) => {
    const texto = textoCampo(c(campo));
    const v = deClickup(lista, texto);
    if (texto && !v) avisos.push(`${campo}: «${texto}»`);
    return v;
  };
  const estado = deClickup(ESTADOS, t.status.status);
  if (!estado) avisos.push(`Estado: «${t.status.status}»`);
  const comp = textoCampo(c("Competencia"));
  const relacionados = c("Relacionado")?.value;
  const imagen = (c("Image")?.value as { url?: string; title?: string }[] | undefined)?.[0];
  const notas = (t.markdown_description ?? t.description ?? "").trim();
  return {
    nombre: t.name.trim().slice(0, 300),
    dropi_id: textoCampo(c("ID"))?.slice(0, 60) ?? null,
    estado: estado ?? "producto_nuevo",
    estado_publicacion: elegir(ESTADOS_PUBLICACION, "Estado de Publicación"),
    tipo_publicacion: elegir(TIPOS, "Tipo de Publicación"),
    privatizado_a: textoCampo(c("Privatizado")),
    privatizado_email: textoCampo(c("Email"))?.toLowerCase() ?? null,
    precio_venta: numero(c("Precio de Venta")),
    costo_mercancia: numero(c("Costo Mercancía")),
    fulfillment: numero(c("Fulfillment")),
    coste_real: numero(c("Coste Real")),
    estado_venta: elegir(ESTADOS_VENTA, "Estado de Venta"),
    ubicacion: elegir(UBICACIONES, "Donde está"),
    estado_reposicion: elegir(ESTADOS_REPOSICION, "Estado de Reposición"),
    competencia: comp === null ? null : /^s[ií]$/i.test(comp),
    fecha_publicacion: fecha(c("Fecha de Publicación")),
    ultima_revision: fecha(c("Última Revisión")),
    ultimo_cambio_precio: fecha(c("Último Cambio de Precio")),
    notas: notas ? notas.slice(0, 5000) : null,
    relacionadosClickup: Array.isArray(relacionados) ? relacionados.map((r: { id?: string }) => r?.id).filter((x): x is string => typeof x === "string" && x !== t.id) : [],
    foto: imagen?.url ? { url: imagen.url, nombre: imagen.title ?? "foto" } : null,
    responsables: t.assignees.map((a) => a.email?.toLowerCase()).filter(Boolean),
    avisos,
  };
}
