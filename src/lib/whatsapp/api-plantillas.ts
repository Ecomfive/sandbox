// Administrar las plantillas en Meta (28 oct 2026): crear, editar, borrar y listar. Con 360dialog (`D360_API_KEY`) por su API de plantillas
// (`/message_templates`, con la misma forma que la de Meta); si no, directo con Meta (`WHATSAPP_TOKEN` y `WHATSAPP_WABA_ID`). El sandbox de
// 360dialog no maneja plantillas. Las claves solo viven en el servidor. Importa con rutas relativas porque también lo usa `scripts/`.

import { construirComponentes, leerListaMeta, type DatosPlantilla, type PlantillaDeMeta } from "./plantillas";
import { config360, urlBase360 } from "./proveedor";
import { leerErrorEnvio } from "./ventana";

interface Acceso {
  origen: "360dialog" | "meta";
  base: string;
  cabeceras: Record<string, string>;
  waba: string | null;
}

/** Con qué se habla con Meta, o por qué todavía no se puede (WhatsApp no está conectado). */
export function accesoPlantillas(): { acceso: Acceso } | { error: string } {
  const d360 = config360();
  if (d360) {
    if (d360.sandbox) return { error: "El sandbox de 360dialog no maneja plantillas: hace falta conectar el número real." };
    return { acceso: { origen: "360dialog", base: urlBase360(d360), cabeceras: { "D360-API-KEY": d360.clave, "Content-Type": "application/json" }, waba: null } };
  }
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { error: "WhatsApp todavía no está conectado: falta la clave de 360dialog (D360_API_KEY) o el token de Meta (WHATSAPP_TOKEN)." };
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!waba || !/^\d+$/.test(waba)) return { error: "Falta el identificador de la cuenta de WhatsApp de Meta (WHATSAPP_WABA_ID)." };
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  if (!/^v\d+\.\d+$/.test(version)) return { error: "La versión de la API de WhatsApp no es válida." };
  return { acceso: { origen: "meta", base: `https://graph.facebook.com/${version}`, cabeceras: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, waba } };
}

/** Si WhatsApp está conectado para manejar plantillas (sin revelar nada de las claves). */
export function conexionPlantillas(): { conectado: boolean; via: "360dialog" | "meta" | null; motivo: string | null } {
  const a = accesoPlantillas();
  return "acceso" in a ? { conectado: true, via: a.acceso.origen, motivo: null } : { conectado: false, via: null, motivo: a.error };
}

const rutaLista = (a: Acceso) => (a.origen === "meta" ? `${a.base}/${a.waba}/message_templates` : `${a.base}/message_templates`);
const rutaUna = (a: Acceso, id: string) => (a.origen === "meta" ? `${a.base}/${encodeURIComponent(id)}` : `${a.base}/message_templates/${encodeURIComponent(id)}`);

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Un error de la API de plantillas en palabras para el equipo (los códigos son los de Meta). */
export function errorDePlantilla(status: number, cuerpo: unknown): string {
  const e = obj(obj(cuerpo).error);
  const codigo = Number(e.code);
  const sub = Number(e.error_subcode);
  if (status === 401 || status === 403 || codigo === 190) return "WhatsApp rechazó la clave o el token. Revísalo en el servidor.";
  if (sub === 2388024) return "Ya existe una plantilla con ese nombre y ese idioma.";
  if (sub === 2388023) return "Ese nombre lo tuvo una plantilla que se borró hace poco: Meta no deja reutilizarlo por 30 días. Usa otro nombre.";
  if (status === 429 || codigo === 80008 || codigo === 4) return "Meta no deja crear más plantillas por ahora (máximo 100 por hora). Inténtalo en un rato.";
  const delUsuario = texto(e.error_user_msg);
  if (delUsuario) return `Meta no la aceptó: ${delUsuario}`;
  return `Meta no la aceptó: ${leerErrorEnvio(status, cuerpo).mensaje}`;
}

async function llamar(a: Acceso, metodo: "GET" | "POST" | "DELETE", url: string, cuerpo?: unknown): Promise<{ json: unknown } | { error: string }> {
  let r: Response;
  try {
    r = await fetch(url, { method: metodo, headers: a.cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(20_000) });
  } catch {
    return { error: "No se pudo conectar con WhatsApp. Inténtalo de nuevo." };
  }
  const crudo = await r.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(crudo);
  } catch {
    // Sin JSON: el texto tal cual sirve de motivo.
    json = crudo;
  }
  if (r.ok) return { json };
  // En los registros de Vercel queda la respuesta tal cual (no lleva claves: solo el motivo de Meta o de 360dialog).
  console.error(`[whatsapp] plantillas: ${metodo} por ${a.origen} rechazado (${r.status}): ${crudo.slice(0, 800)}`);
  return { error: errorDePlantilla(r.status, json) };
}

/** Manda una plantilla nueva a revisión de Meta. Devuelve su id y cómo la dejó (en revisión, normalmente). */
export async function crearPlantillaMeta(d: DatosPlantilla): Promise<{ metaId: string; estado: string | null; categoria: string | null } | { error: string }> {
  const a = accesoPlantillas();
  if ("error" in a) return a;
  const r = await llamar(a.acceso, "POST", rutaLista(a.acceso), { name: d.nombre.trim(), language: d.idioma, category: d.categoria.toUpperCase(), components: construirComponentes(d) });
  if ("error" in r) return r;
  const j = obj(r.json);
  const id = j.id !== undefined && j.id !== null ? String(j.id) : null;
  if (!id) return { error: "Meta no devolvió el identificador de la plantilla. Actualiza el estado en un momento." };
  return { metaId: id, estado: texto(j.status), categoria: texto(j.category) };
}

/** Cambia el texto de una plantilla ya creada (Meta la vuelve a revisar). El nombre, el idioma y la categoría no se cambian. */
export async function editarPlantillaMeta(metaId: string, d: DatosPlantilla): Promise<{ ok: true } | { error: string }> {
  const a = accesoPlantillas();
  if ("error" in a) return a;
  const r = await llamar(a.acceso, "POST", rutaUna(a.acceso, metaId), { components: construirComponentes(d) });
  return "error" in r ? r : { ok: true };
}

/** Borra una plantilla en Meta: la de ese idioma si se da `metaId`, o todas las de ese nombre. */
export async function borrarPlantillaMeta(nombre: string, metaId: string | null): Promise<{ ok: true } | { error: string }> {
  const a = accesoPlantillas();
  if ("error" in a) return a;
  const consulta = `name=${encodeURIComponent(nombre)}${metaId ? `&hsm_id=${encodeURIComponent(metaId)}` : ""}`;
  const r = await llamar(a.acceso, "DELETE", `${rutaLista(a.acceso)}?${consulta}`);
  return "error" in r ? r : { ok: true };
}

const CAMPOS = "id,name,status,category,language,components,quality_score,rejected_reason";

/** Todas las plantillas de la cuenta, con su estado, calidad y categoría actuales (hasta 1.000). */
export async function listarPlantillasMeta(): Promise<{ plantillas: PlantillaDeMeta[] } | { error: string }> {
  const a = accesoPlantillas();
  if ("error" in a) return a;
  const plantillas: PlantillaDeMeta[] = [];
  let despues: string | null = null;
  for (let pagina = 0; pagina < 10; pagina++) {
    const r = await llamar(a.acceso, "GET", `${rutaLista(a.acceso)}?fields=${CAMPOS}&limit=100${despues ? `&after=${encodeURIComponent(despues)}` : ""}`);
    if ("error" in r) return r;
    const j = obj(r.json);
    plantillas.push(...leerListaMeta(j.data));
    despues = texto(obj(obj(j.paging).cursors).after);
    if (!despues || !texto(obj(j.paging).next)) break;
  }
  return { plantillas };
}
