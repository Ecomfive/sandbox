// Baja COMPLETA la lista «GCC 🇵🇦 Ecomfive Panamá» de ClickUp (los productos publicados en Dropi como proveedor): todas las
// tareas de cualquier estado (también «archivado»), con sus campos personalizados tal como vienen y la descripción, junto con la
// definición de la lista (estados) y de sus campos (con sus opciones). La importa scripts/importar-publicaciones-dropi.ts.
//
// Uso: node scripts/clickup-exportar-publicaciones-dropi.mjs
// Salida: datos-privados/clickup-gcc-panama.json (carpeta ignorada por git).
// Token: la línea CLICKUP_TOKEN=... de .env.local. Solo lee de ClickUp: no cambia nada allá.

import { clickupDescontinuado } from "./clickup-descontinuado.mjs";

clickupDescontinuado("clickup-exportar-publicaciones-dropi.mjs");

import { readFileSync, writeFileSync } from "node:fs";

const LISTA = "901712264897"; // GCC 🇵🇦 Ecomfive Panamá
const SALIDA = "datos-privados/clickup-gcc-panama.json";

const token = (process.env.CLICKUP_TOKEN ?? readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("CLICKUP_TOKEN="))?.slice(14) ?? "")
  .trim()
  .replace(/^["']|["']$/g, "");
if (!token) {
  console.error("Falta el token de ClickUp (CLICKUP_TOKEN en .env.local).");
  process.exit(1);
}

async function api(ruta) {
  for (let intento = 0; intento < 6; intento++) {
    const r = await fetch(`https://api.clickup.com/api/v2${ruta}`, { headers: { Authorization: token } });
    if (r.status === 429) {
      await new Promise((s) => setTimeout(s, 3000 * (intento + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`ClickUp ${r.status} en ${ruta}`);
    return r.json();
  }
  throw new Error(`ClickUp no respondió en ${ruta}`);
}

const lista = await api(`/list/${LISTA}`);
const campos = (await api(`/list/${LISTA}/field`)).fields;
const tareas = [];
for (let p = 0; ; p++) {
  const r = await api(`/list/${LISTA}/task?page=${p}&include_closed=true&subtasks=true&archived=false&include_markdown_description=true`);
  tareas.push(...(r.tasks ?? []));
  if (r.last_page || !(r.tasks ?? []).length) break;
}
writeFileSync(SALIDA, JSON.stringify({ lista, campos, tareas, bajado_en: new Date().toISOString() }, null, 1));
console.log(`${lista.name}: ${tareas.length} tareas, ${campos.length} campos → ${SALIDA}`);
