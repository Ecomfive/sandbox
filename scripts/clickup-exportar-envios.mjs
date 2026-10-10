// Baja la lista «Envíos desde China» de ClickUp (rutas de envío por agente, país y vía) a datos-privados/clickup-envios.json,
// para importarla con scripts/importar-rutas-envio.ts. Token: CLICKUP_TOKEN de .env.local.
import { readFileSync, writeFileSync } from "node:fs";
const LISTA = "901705203080";
const token = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("CLICKUP_TOKEN=")).slice(14).trim().replace(/^["']|["']$/g, "");
const r = await fetch(`https://api.clickup.com/api/v2/list/${LISTA}/task?include_closed=true&subtasks=true`, { headers: { Authorization: token } });
if (!r.ok) throw new Error(`ClickUp ${r.status}`);
const { tasks } = await r.json();
writeFileSync("datos-privados/clickup-envios.json", JSON.stringify(tasks, null, 1));
console.log(`${tasks.length} rutas`);
for (const t of tasks) {
  const campo = (n) => t.custom_fields.find((f) => f.name.includes(n));
  const etiquetas = (f) => (f?.value ?? []).map((id) => f.type_config.options.find((o) => o.id === id)?.label).join(",");
  console.log([t.name, campo("Tiempo")?.value ?? "", etiquetas(campo("Agente")), etiquetas(campo("Países")), JSON.stringify(campo("Nota")?.value ?? ""), campo("URL")?.value ?? ""].join(" | "));
}
