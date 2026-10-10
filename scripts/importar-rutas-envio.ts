// Importa la lista «Envíos desde China» de ClickUp (bajada con scripts/clickup-exportar-envios.mjs a
// datos-privados/clickup-envios.json) a Compras › Envíos (migración 0092). Una tarea con dos agentes da una ruta por agente.
// El estado de ClickUp no se toma (pedido de Hernán). Las tarifas salen de la nota: «1 CBM= $950 (Productos General)»,
// «1CBM = $750», «Productos General: $16.5 por KG»; lo demás de la nota («Hasta Oficina: $5/Kg») queda en la nota.
//
//   npx tsx scripts/importar-rutas-envio.ts            → informe
//   npx tsx scripts/importar-rutas-envio.ts --aplicar  → crea las rutas que falten (las que ya existen no se tocan)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { parsearTiempo } from "../src/lib/compras/rutas-envio";
import { normalPais, paisesDelMundo } from "../src/lib/paises-mundo";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const tareas: Json[] = JSON.parse(readFileSync("datos-privados/clickup-envios.json", "utf8"));
const campo = (t: Json, nombre: string) => t.custom_fields.find((f: Json) => f.name.includes(nombre));
const etiquetas = (f: Json | undefined): string[] => (f?.value ?? []).map((id: string) => f!.type_config.options.find((o: Json) => o.id === id)?.label).filter(Boolean);
const sinEmoji = (t: string) => t.replace(/[^\p{L}\p{N}\s]/gu, "").trim();

/** Las tarifas de la nota, cada una con el agente al que se refiere la nota (si lo nombra al principio). */
function tarifasDe(nota: string): { agente: string | null; tipo: string; precio: number; unidad: "cbm" | "kg" }[] {
  const agente = /^\s*(Avery|Chin)\b/i.exec(nota)?.[1] ?? null;
  const out: { agente: string | null; tipo: string; precio: number; unidad: "cbm" | "kg" }[] = [];
  for (const linea of nota.split(/\n/)) {
    if (/hasta oficina/i.test(linea)) continue;
    const precio = /\$\s*([\d.,]+)/.exec(linea)?.[1];
    if (!precio) continue;
    const unidad = /cbm/i.test(linea) ? "cbm" : /kg/i.test(linea) ? "kg" : null;
    if (!unidad) continue;
    const tipoTexto = /\(([^)]+)\)/.exec(linea)?.[1] ?? /^([^:$]+):/.exec(linea)?.[1] ?? "General";
    const tipo = /general/i.test(tipoTexto) || /cbm/i.test(tipoTexto) ? "General" : tipoTexto.trim();
    out.push({ agente, tipo, precio: Number(precio.replace(/,/g, "")), unidad });
  }
  return out;
}

(async () => {
  const filas: Json[] = [];
  const avisos: string[] = [];
  for (const t of tareas) {
    const nombre = String(t.name);
    const modalidad = /^(DDP|DAP)/i.exec(nombre)?.[1]?.toUpperCase() ?? null;
    const via = /\bSEA\b/i.test(nombre) ? "mar" : /\bAIR\b/i.test(nombre) ? "aire" : null;
    const courier = /\b(UPS|DHL|FEDEX)\b/i.exec(nombre)?.[1]?.toUpperCase() ?? null;
    const paisTexto = sinEmoji(etiquetas(campo(t, "Países"))[0] ?? nombre.split("-").pop() ?? "");
    const pais = paisesDelMundo().find((p) => normalPais(p.nombre) === normalPais(paisTexto));
    if (!via || !pais) {
      avisos.push(`No entendí «${nombre}» (país ${paisTexto}).`);
      continue;
    }
    const tiempo = String(campo(t, "Tiempo")?.value ?? "");
    const nota = String(campo(t, "Nota")?.value ?? "").trim();
    const url = campo(t, "URL")?.value ?? null;
    const agentes = etiquetas(campo(t, "Agente"));
    const tarifas = tarifasDe(nota);
    for (const agente of agentes.length ? agentes : [null]) {
      // «Avery: 55-65 days, Chin: about 60 days»: cada agente con su tramo; si no, el mismo tiempo para todos.
      const tramo = agente ? new RegExp(`${agente}\\s*:\\s*([^,]+)`, "i").exec(tiempo)?.[1] : null;
      const dias = parsearTiempo(tramo ?? tiempo);
      filas.push({
        clickup_id: t.id,
        agente,
        pais_codigo: pais.codigo,
        pais_nombre: pais.nombre,
        via,
        modalidad,
        courier,
        dias_min: dias?.min ?? null,
        dias_max: dias?.max ?? null,
        activo: true,
        nota: nota || null,
        url,
        _tarifas: tarifas.filter((x) => !x.agente || !agente || x.agente.toLowerCase() === agente.toLowerCase()),
        _desde: new Date(Number(t.date_created)).toISOString().slice(0, 10),
        _tiempo: tiempo,
      });
    }
  }

  // Correcciones de Hernán (8 oct 2026): en España y México los tiempos estaban en la tarea equivocada (el marítimo no puede
  // ser más rápido que el aéreo), y Costa Rica se envía con Chin.
  const ruta = (pais: string, via: string, agente: string | null) => filas.find((f) => f.pais_codigo === pais && f.via === via && f.agente === agente);
  const espMar = ruta("ES", "mar", "Avery");
  const espAireAvery = ruta("ES", "aire", "Avery");
  const espAireChin = ruta("ES", "aire", "Chin");
  if (espMar && espAireAvery && espAireChin) {
    [espMar.dias_min, espMar.dias_max, espAireAvery.dias_min, espAireAvery.dias_max] = [espAireAvery.dias_min, espAireAvery.dias_max, espMar.dias_min, espMar.dias_max];
    espAireChin.via = "mar"; // «Chin: about 60 days» era del marítimo
  }
  const mxMar = ruta("MX", "mar", "Chin");
  const mxAire = ruta("MX", "aire", "Chin");
  if (mxMar && mxAire) [mxMar.dias_min, mxMar.dias_max, mxAire.dias_min, mxAire.dias_max] = [mxAire.dias_min, mxAire.dias_max, mxMar.dias_min, mxMar.dias_max];
  for (const f of filas) if (f.pais_codigo === "CR" && !f.agente) f.agente = "Chin";

  // --sql: escribe la migración con las rutas (para pegarla en el editor SQL de Supabase).
  if (process.argv.includes("--sql")) {
    const q = (v: unknown) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `$q$${String(v)}$q$`);
    const partes = filas.map((f) => {
      const tarifas = (f._tarifas as Json[])
        .map((x) => `  insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, ${q(x.tipo)}, ${x.precio}, ${q(x.unidad)}, ${q(f._desde)}, 'Importado de ClickUp');`)
        .join("\n");
      return `  if not exists (select 1 from wms_rutas_envio where clickup_id = ${q(f.clickup_id)} and agente is not distinct from ${q(f.agente)} and via = ${q(f.via)}) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values (${[f.clickup_id, f.agente, f.pais_codigo, f.pais_nombre, f.via, f.modalidad, f.courier, f.dias_min, f.dias_max, f.activo, f.nota, f.url].map(q).join(", ")})
    returning id into nueva;
${tarifas ? tarifas.replace(/^ {2}/gm, "    ") + "\n" : ""}  end if;`;
    });
    const sql = `-- Compras › Envíos: las ${filas.length} rutas de la lista «Envíos desde China» de ClickUp (generado con
-- scripts/importar-rutas-envio.ts --sql). Ya corregidas: España y México tenían el tiempo del marítimo y el del aéreo
-- cambiados, y Costa Rica va con Chin. Además, las compras de Costa Rica quedan con agente de envío «Chin».
-- Se puede repetir sin duplicar. Va después de la 0092.

do $$
declare
  nueva uuid;
begin
${partes.join("\n")}
end $$;

update wms_compras set agente_envio = 'Chin'
where agente_envio is null and tipo = 'pais' and pais_id = (select id from paises where codigo = 'CR');
`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync("supabase/migrations/0093_importar_rutas_envio.sql", sql);
    console.log("Escrita supabase/migrations/0093_importar_rutas_envio.sql");
  }

  for (const f of filas)
    console.log(
      `${f.pais_nombre.padEnd(12)} ${f.via.padEnd(5)} ${(f.agente ?? "—").padEnd(6)} ${[f.modalidad, f.courier].filter(Boolean).join(" ").padEnd(8)} ${f.dias_min ?? "?"}–${f.dias_max ?? "?"} d («${f._tiempo}») · tarifas: ${
        f._tarifas.map((x: Json) => `${x.tipo} $${x.precio}/${x.unidad}`).join(", ") || "—"
      }`,
    );
  for (const a of avisos) console.log("⚠ " + a);
  console.log(`\n${filas.length} rutas de ${tareas.length} tareas.`);
  if (!aplicar) return console.log("Sin --aplicar no se guardó nada.");

  const { data: existentes, error } = await supabase.from("wms_rutas_envio").select("clickup_id, agente");
  if (error) throw new Error(`¿Falta la migración 0092? ${error.message}`);
  const ya = new Set((existentes ?? []).map((e) => `${e.clickup_id}|${e.agente ?? ""}`));
  let creadas = 0;
  for (const f of filas) {
    if (ya.has(`${f.clickup_id}|${f.agente ?? ""}`)) continue;
    const { _tarifas, _desde, _tiempo, ...ruta } = f; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { data, error: e } = await supabase.from("wms_rutas_envio").insert(ruta).select("id").single();
    if (e) throw e;
    if (_tarifas.length)
      await supabase.from("wms_rutas_envio_tarifas").insert(
        _tarifas.map((x: Json) => ({ ruta_id: data.id, tipo_producto: x.tipo, precio: x.precio, unidad: x.unidad, vigente_desde: _desde, creado_por: "Importado de ClickUp" })),
      );
    creadas++;
  }
  console.log(`Creadas: ${creadas}.`);
})();
