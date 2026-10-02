// Baja la lista «CRM DROPI» de ClickUp completa (todas las tareas, de cualquier estado, con sus campos, etiquetas,
// responsables, descripción y comentarios) a un archivo local para migrarla al CRM.
//
// Uso: node scripts/clickup-exportar-crm.mjs
// Token: variable CLICKUP_TOKEN, o una línea con «pk_...» en .env.local (ese archivo no se sube a git).
// Salida: datos-privados/clickup-crm.json (carpeta ignorada por git; son datos personales de clientes).
// Solo lee de ClickUp: no cambia nada allá. No imprime datos de personas, solo conteos.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const LISTA = "901707677923";
const SALIDA = "datos-privados/clickup-crm.json";

function leerToken() {
  if (process.env.CLICKUP_TOKEN) return process.env.CLICKUP_TOKEN.trim();
  try {
    const m = readFileSync(".env.local", "utf8").match(/pk_[A-Za-z0-9_]+/);
    if (m) return m[0];
  } catch {}
  console.error("Falta el token de ClickUp (CLICKUP_TOKEN o una línea pk_... en .env.local).");
  process.exit(1);
}
const token = leerToken();

async function api(ruta) {
  for (let intento = 0; intento < 6; intento++) {
    const r = await fetch(`https://api.clickup.com/api/v2${ruta}`, { headers: { Authorization: token } });
    if (r.status === 429) {
      await new Promise((ok) => setTimeout(ok, 15000));
      continue;
    }
    if (!r.ok) throw new Error(`ClickUp ${r.status} en ${ruta.split("?")[0]}`);
    return r.json();
  }
  throw new Error("ClickUp: demasiados reintentos");
}

// Valor legible de un campo personalizado (las listas y etiquetas vienen como ids: se traducen a su nombre).
function valorCampo(c) {
  const v = c.value;
  if (v === undefined || v === null || v === "") return null;
  const opciones = c.type_config?.options ?? [];
  if (c.type === "drop_down") {
    const o = opciones.find((x) => x.orderindex === v || x.id === v);
    return o?.name ?? null;
  }
  if (c.type === "labels") return (Array.isArray(v) ? v : []).map((id) => opciones.find((x) => x.id === id)?.label ?? id);
  if (c.type === "date") return new Date(Number(v)).toISOString();
  return v;
}

const tareas = [];
for (let pagina = 0; ; pagina++) {
  const r = await api(`/list/${LISTA}/task?page=${pagina}&include_closed=true&subtasks=true&include_markdown_description=true`);
  tareas.push(...r.tasks);
  if (r.last_page || r.tasks.length === 0) break;
}

const filas = [];
for (const t of tareas) {
  let comentarios = [];
  try {
    const c = await api(`/task/${t.id}/comment`);
    comentarios = (c.comments ?? []).map((x) => ({
      autor: x.user?.username ?? null,
      fecha_ms: Number(x.date),
      texto: x.comment_text ?? "",
    }));
  } catch {
    // Sin comentarios legibles: se sigue con el resto.
  }
  const campos = {};
  for (const c of t.custom_fields ?? []) {
    const v = valorCampo(c);
    if (v !== null) campos[`${c.name}${c.type === "short_text" || c.type === "drop_down" ? ` (${c.type})` : ""}`] = v;
  }
  filas.push({
    id: t.id,
    nombre: t.name,
    estado: t.status?.status ?? null,
    creado_ms: Number(t.date_created),
    actualizado_ms: Number(t.date_updated),
    cerrado_ms: t.date_closed ? Number(t.date_closed) : null,
    creador: t.creator?.username ?? null,
    responsables: (t.assignees ?? []).map((a) => a.username),
    etiquetas: (t.tags ?? []).map((x) => x.name),
    prioridad: t.priority?.priority ?? null,
    descripcion: t.markdown_description ?? t.text_content ?? "",
    padre: t.parent ?? null,
    url: t.url,
    campos,
    comentarios,
  });
  await new Promise((ok) => setTimeout(ok, 700)); // ~85 por minuto, bajo el límite de ClickUp
}

mkdirSync("datos-privados", { recursive: true });
writeFileSync(SALIDA, JSON.stringify(filas, null, 2), "utf8");

const porEstado = {};
for (const f of filas) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
console.log(`Guardadas ${filas.length} tareas en ${SALIDA}`);
console.log("Por estado:", porEstado);
console.log("Con comentarios:", filas.filter((f) => f.comentarios.length).length);
