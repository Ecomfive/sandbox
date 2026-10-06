// Baja COMPLETAS las listas de compras de ClickUp (todas las tareas de cualquier estado, con subtareas, campos
// personalizados tal como vienen, adjuntos, checklists, etiquetas, responsables, descripción, comentarios y el historial
// de estados con sus horas), junto con la
// definición de cada lista (estados y campos con sus opciones), a un archivo local para inventariarlas e importarlas.
//
// Uso: node scripts/clickup-exportar-compras.mjs            → todas las listas
//      node scripts/clickup-exportar-compras.mjs --solo MX  → solo esas listas (separadas por coma), y las mezcla con lo ya bajado
// Salida: datos-privados/clickup-compras.json (carpeta ignorada por git: datos de proveedores y pagos).
// Token: variable CLICKUP_TOKEN, o la línea CLICKUP_TOKEN=... de .env.local (ese archivo no se sube a git).
// Solo lee de ClickUp: no cambia nada allá. Solo imprime conteos.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Las listas de compras compartidas con la cuenta (ver /team/{id}/shared).
const LISTAS = [
  { id: "901703276928", clave: "PA" }, // Compras Dropi 🇵🇦 Panamá
  { id: "901711122181", clave: "CR" }, // Compras Dropi 🇨🇷 Costa Rica
  { id: "901711155935", clave: "VE" }, // Compras Dropi 🇻🇪 Venezuela
  { id: "901713646716", clave: "SV" }, // Compras Dropi 🇸🇻 El Salvador
  { id: "901712816880", clave: "NI" }, // Compras Dropi 🇳🇮 Nicaragua
  { id: "901711155824", clave: "GT" }, // Compras Dropi 🇬🇹 Guatemala
  { id: "901711155894", clave: "HN" }, // Compras Dropi 🇭🇳 Honduras
  { id: "901711122406", clave: "MX" }, // Compras Dropi 🇲🇽 México
  { id: "901705771256", clave: "importadora" }, // Compras Importadora 🌍 (servicio a clientes, no es de un país)
  { id: "901704851476", clave: "chat_compras" }, // Chat Compras EcomFive 📦
];
const SALIDA = "datos-privados/clickup-compras.json";
const i = process.argv.indexOf("--solo");
const SOLO = i >= 0 ? process.argv[i + 1].split(",").map((x) => x.trim()) : null;

function leerToken() {
  if (process.env.CLICKUP_TOKEN) return process.env.CLICKUP_TOKEN.trim();
  try {
    const linea = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("CLICKUP_TOKEN="));
    if (linea) return linea.slice("CLICKUP_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
  } catch {}
  console.error("Falta el token de ClickUp (CLICKUP_TOKEN en .env.local).");
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

const salida = { exportado_en: new Date().toISOString(), listas: [] };
for (const { id, clave } of LISTAS.filter((l) => !SOLO || SOLO.includes(l.clave))) {
  const lista = await api(`/list/${id}`);
  const { fields } = await api(`/list/${id}/field`);
  const tareas = [];
  for (let pagina = 0; ; pagina++) {
    const r = await api(`/list/${id}/task?page=${pagina}&include_closed=true&subtasks=true&include_markdown_description=true&archived=false`);
    tareas.push(...r.tasks);
    if (r.last_page || r.tasks.length === 0) break;
  }
  // Las archivadas también: no debe quedar nada por fuera.
  for (let pagina = 0; ; pagina++) {
    const r = await api(`/list/${id}/task?page=${pagina}&include_closed=true&subtasks=true&include_markdown_description=true&archived=true`);
    for (const t of r.tasks) if (!tareas.some((x) => x.id === t.id)) tareas.push({ ...t, _archivada: true });
    if (r.last_page || r.tasks.length === 0) break;
  }

  const completas = [];
  for (const t of tareas) {
    // La tarea una por una trae adjuntos y checklists completos.
    const detalle = await api(`/task/${t.id}?include_subtasks=true&include_markdown_description=true`);
    let comentarios = [];
    try {
      comentarios = (await api(`/task/${t.id}/comment`)).comments ?? [];
    } catch {}
    // Historial del Estado: cada estado por el que pasó, desde cuándo y cuántos minutos estuvo.
    let tiempos = null;
    try {
      tiempos = await api(`/task/${t.id}/time_in_status`);
    } catch {}
    completas.push({ ...detalle, _archivada: t._archivada === true, _comentarios: comentarios, _tiempo_en_estado: tiempos });
    await new Promise((ok) => setTimeout(ok, 300));
  }
  salida.listas.push({ clave, lista, campos: fields, tareas: completas });
  console.log(`${lista.name}: ${completas.length} tareas, ${fields.length} campos, ${(lista.statuses ?? []).length} estados`);
}

mkdirSync("datos-privados", { recursive: true });
// Con --solo, lo nuevo reemplaza esas listas dentro de lo que ya estaba bajado.
if (SOLO) {
  let previo = { listas: [] };
  try {
    previo = JSON.parse(readFileSync(SALIDA, "utf8"));
  } catch {}
  salida.listas = [...previo.listas.filter((l) => !SOLO.includes(l.clave)), ...salida.listas];
}
writeFileSync(SALIDA, JSON.stringify(salida, null, 2), "utf8");
console.log(`Guardado en ${SALIDA}`);
