// Inventario de lo que hay en datos-privados/clickup-compras.json (lo baja clickup-exportar-compras.mjs): cada campo con su
// tipo, cuántas tareas lo usan y sus valores (opciones con su conteo, o ejemplos de rango); además estados, etiquetas,
// responsables, adjuntos, subtareas, checklists y comentarios. Es la base para decidir a qué columna va cada dato.
//
// Uso: node scripts/clickup-inventario-compras.mjs   →   datos-privados/inventario-compras.txt

import { readFileSync, writeFileSync } from "node:fs";

const datos = JSON.parse(readFileSync("datos-privados/clickup-compras.json", "utf8"));
const lineas = [];
const p = (s = "") => lineas.push(s);
const contar = (arr) => Object.entries(arr.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const vacio = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

for (const { lista, campos, tareas } of datos.listas) {
  p(`=== ${lista.name} (${lista.id}) — ${tareas.length} tareas (${tareas.filter((t) => t._archivada).length} archivadas, ${tareas.filter((t) => t.parent).length} subtareas)`);
  p(`Estados de la lista: ${(lista.statuses ?? []).map((s) => `${s.status} [${s.type}]`).join(" · ")}`);
  p(`Estados usados: ${contar(tareas.map((t) => t.status?.status ?? "—")).map(([k, n]) => `${k}: ${n}`).join(" · ")}`);
  p(`Prioridad: ${contar(tareas.map((t) => t.priority?.priority ?? "sin")).map(([k, n]) => `${k}: ${n}`).join(" · ")}`);
  p(`Etiquetas: ${contar(tareas.flatMap((t) => (t.tags ?? []).map((x) => x.name))).map(([k, n]) => `${k}: ${n}`).join(" · ") || "—"}`);
  p(`Responsables: ${contar(tareas.flatMap((t) => (t.assignees ?? []).map((x) => x.username))).map(([k, n]) => `${k}: ${n}`).join(" · ") || "—"}`);
  p(`Creadores: ${contar(tareas.map((t) => t.creator?.username ?? "—")).map(([k, n]) => `${k}: ${n}`).join(" · ")}`);
  p(`Con descripción: ${tareas.filter((t) => (t.markdown_description ?? t.text_content ?? "").trim()).length}`);
  p(`Con fecha de vencimiento (due_date): ${tareas.filter((t) => t.due_date).length} · start_date: ${tareas.filter((t) => t.start_date).length} · cerradas (date_closed): ${tareas.filter((t) => t.date_closed).length}`);
  p(`Con estimado de tiempo: ${tareas.filter((t) => t.time_estimate).length} · con tiempo registrado: ${tareas.filter((t) => t.time_spent).length}`);
  const adj = tareas.flatMap((t) => t.attachments ?? []);
  p(`Adjuntos: ${adj.length} en ${tareas.filter((t) => (t.attachments ?? []).length).length} tareas · tipos: ${contar(adj.map((a) => a.extension ?? "?")).map(([k, n]) => `${k}: ${n}`).join(" · ")}`);
  p(`Checklists: ${tareas.filter((t) => (t.checklists ?? []).length).length} tareas · ${tareas.flatMap((t) => t.checklists ?? []).flatMap((c) => c.items ?? []).length} ítems`);
  p(`Comentarios: ${tareas.flatMap((t) => t._comentarios ?? []).length} en ${tareas.filter((t) => (t._comentarios ?? []).length).length} tareas`);
  p(`Dependencias: ${tareas.filter((t) => (t.dependencies ?? []).length).length} · enlaces: ${tareas.filter((t) => (t.linked_tasks ?? []).length).length}`);
  p(`Fechas de creación: ${new Date(Math.min(...tareas.map((t) => Number(t.date_created)))).toISOString().slice(0, 10)} a ${new Date(Math.max(...tareas.map((t) => Number(t.date_created)))).toISOString().slice(0, 10)}`);
  p("");
  p("--- Campos personalizados ---");
  for (const c of campos) {
    const valores = tareas.map((t) => (t.custom_fields ?? []).find((x) => x.id === c.id)?.value).filter((v) => !vacio(v));
    p(`* ${c.name}  [${c.type}]  usado en ${valores.length}/${tareas.length}`);
    const opciones = c.type_config?.options ?? [];
    if (c.type === "drop_down") {
      const nombres = valores.map((v) => opciones.find((o) => o.orderindex === v || o.id === v)?.name ?? `?${v}`);
      p(`    opciones (${opciones.length}): ${opciones.map((o) => o.name).join(" | ")}`);
      p(`    uso: ${contar(nombres).map(([k, n]) => `${k}: ${n}`).join(" · ")}`);
    } else if (c.type === "labels") {
      const nombres = valores.flatMap((v) => (Array.isArray(v) ? v : []).map((id) => opciones.find((o) => o.id === id)?.label ?? `?${id}`));
      p(`    opciones (${opciones.length}): ${opciones.map((o) => o.label).join(" | ")}`);
      p(`    uso: ${contar(nombres).map(([k, n]) => `${k}: ${n}`).join(" · ")}`);
    } else if (["number", "currency", "formula", "rollup", "progress", "rating"].includes(c.type)) {
      const nums = valores.map((v) => (typeof v === "object" ? Number(v.percent_complete ?? NaN) : Number(v))).filter((n) => Number.isFinite(n));
      if (nums.length) p(`    rango: ${Math.min(...nums)} a ${Math.max(...nums)} · suma ${nums.reduce((a, b) => a + b, 0).toFixed(2)}${c.type_config?.currency_type ? ` · moneda ${c.type_config.currency_type}` : ""}`);
      if (c.type === "formula") p(`    fórmula: ${c.type_config?.formula ?? "?"}`);
    } else if (c.type === "date") {
      const f = valores.map((v) => Number(v)).filter(Boolean);
      if (f.length) p(`    de ${new Date(Math.min(...f)).toISOString().slice(0, 10)} a ${new Date(Math.max(...f)).toISOString().slice(0, 10)}`);
    } else if (c.type === "checkbox") {
      p(`    marcados: ${valores.filter((v) => v === true || v === "true").length}`);
    } else if (c.type === "attachment") {
      p(`    archivos: ${valores.flatMap((v) => (Array.isArray(v) ? v : [])).length}`);
    } else if (["users", "tasks", "list_relationship"].includes(c.type)) {
      p(`    ejemplos: ${valores.slice(0, 3).map((v) => JSON.stringify(v).slice(0, 80)).join(" ; ")}`);
    } else {
      const textos = valores.map((v) => String(typeof v === "object" ? JSON.stringify(v) : v));
      p(`    distintos: ${new Set(textos).size} · ejemplos: ${[...new Set(textos)].slice(0, 4).map((x) => `«${x.slice(0, 50)}»`).join(" ")}`);
    }
  }
  p("");
}

writeFileSync("datos-privados/inventario-compras.txt", lineas.join("\n"), "utf8");
console.log(lineas.join("\n"));
