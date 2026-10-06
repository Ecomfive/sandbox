// Junta en datos-privados/clickup-etapas.json lo que la página de ClickUp devolvió en la conversación con Claude (bloques
// «@@ACT@@{autores}\nid=línea;línea…»), leyendo el archivo .jsonl de la conversación. Uso:
//   node scripts/extraer-etapas-transcripcion.mjs <ruta.jsonl>
import { readFileSync, writeFileSync } from "node:fs";

const res = {};
let autores = {};
for (const linea of readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!linea.includes("@@ACT@@") || !linea.includes('"tool_result"')) continue;
  const reg = JSON.parse(linea);
  const contenido = reg.message?.content ?? [];
  for (const c of contenido) {
    const textos = typeof c.content === "string" ? [c.content] : (c.content ?? []).map((x) => x.text ?? "");
    for (const t of textos) {
      const i = t.indexOf("@@ACT@@");
      if (i < 0) continue;
      // La salida viene como texto JSON entre comillas.
      const crudo = t.slice(t.lastIndexOf('"', i), t.indexOf('"\n', i) >= 0 ? t.indexOf('"\n', i) + 1 : t.lastIndexOf('"') + 1);
      const cuerpo = JSON.parse(crudo).slice("@@ACT@@".length);
      const [cab, ...filas] = cuerpo.split("\n");
      autores = { ...autores, ...JSON.parse(cab).autores };
      for (const f of filas) {
        const k = f.indexOf("=");
        res[f.slice(0, k)] = f.slice(k + 1) ? f.slice(k + 1).split(";") : [];
      }
    }
  }
}
writeFileSync("datos-privados/clickup-etapas.json", JSON.stringify({ zona: "America/Panama", leido_en: new Date().toISOString(), autores, res }, null, 1));
console.log(`Compras: ${Object.keys(res).length}, autores: ${Object.keys(autores).join(", ")}`);
