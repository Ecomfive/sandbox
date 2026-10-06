// Carga el historial exacto de la Etapa de cada compra, leído de la Actividad de ClickUp (la API no da el historial de los
// campos personalizados). La lectura se hizo en la página de ClickUp con la sesión de Hernán y quedó en
// datos-privados/clickup-etapas.json: { zona, leido_en, autores: { nombre: código }, res: { clickupId: ["código|de>a|fecha"] } }.
// Las fechas vienen como las muestra ClickUp («may. 19 2:14 pm», con «, 2025» si no es de este año) en la zona horaria
// del navegador (`zona`). Se puede repetir: rehace los eventos de Etapa con origen «clickup_actividad».
//
//   npx tsx scripts/importar-etapas-actividad.ts            → informe (no escribe)
//   npx tsx scripts/importar-etapas-actividad.ts --aplicar  → guarda los eventos

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const datos = JSON.parse(readFileSync("datos-privados/clickup-etapas.json", "utf8")) as {
  zona: string;
  leido_en: string;
  autores: Record<string, number>;
  res: Record<string, string[]>;
};
// Quien tenía la sesión abierta al leer sale como «Nombre (Tú)».
const autorPorCodigo = Object.fromEntries(Object.entries(datos.autores).map(([n, c]) => [String(c), n.replace(/\s*\(Tú\)$/, "")]));
const REASIGNAR: Record<string, string> = {
  "Zeylimar Moreno": "Francis Aponte",
  "Maria Jose Aponte": "Francis Aponte",
  "María José Aponte": "Francis Aponte",
  "Fabiola Concha": "Francis Aponte",
  "Andreina Andrade de Morales": "Francis Aponte",
};

// Igual que en importar-compras-clickup.ts: la Etapa por su número.
const ETAPA_POR_NUMERO: Record<string, string> = {
  "01": "solicitud_local",
  "02": "solicitud_internacional",
  "03": "cotizar",
  "04": "cotizado",
  "05": "evaluacion_proveedor",
  "06": "solicitud_proveedor",
  "07": "compra_pago",
  "08": "produccion",
  "09": "tracking",
  "10": "aviso_logistica",
  "11": "arribo_mercancia",
  "12": "completado",
};
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const noReconocidos = new Map<string, number>();
const anotar = (que: string) => noReconocidos.set(que, (noReconocidos.get(que) ?? 0) + 1);

function etapa(v: string): string | null {
  if (!v || v === "–") return null;
  const n = normal(v);
  if (/^\d{1,2}$/.test(n)) {
    const e = ETAPA_POR_NUMERO[n.padStart(2, "0")];
    if (e) return e;
  }
  if (n.startsWith("backlog")) return "backlog";
  if (n.startsWith("descartado")) return "descartado";
  anotar(`etapa «${v}»`);
  return v;
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };
/** Desfase en minutos de la zona horaria en una fecha (p. ej. America/Panama → -300). */
function desfase(zona: string, utc: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(utc)
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((local - utc.getTime()) / 60000);
}
/** «may. 19 2:14 pm» o «mar. 6, 2025 10:18 am» → fecha UTC. Sin año: este año, o el anterior si quedaría en el futuro. */
function fecha(texto: string): Date | null {
  const m = texto.match(/^([a-z]+)\.? (\d{1,2})(?:, (\d{4}))? (\d{1,2}):(\d{2}) ([ap])m$/i);
  if (!m) return null;
  const mes = MESES[normal(m[1])];
  if (!mes) return null;
  const hora = (Number(m[4]) % 12) + (m[6].toLowerCase() === "p" ? 12 : 0);
  const leido = new Date(datos.leido_en);
  const armar = (anio: number) => {
    const comoUtc = new Date(Date.UTC(anio, mes - 1, Number(m[2]), hora, Number(m[5])));
    return new Date(comoUtc.getTime() - desfase(datos.zona, comoUtc) * 60000);
  };
  if (m[3]) return armar(Number(m[3]));
  const d = armar(leido.getUTCFullYear());
  return d.getTime() > leido.getTime() + 86400000 ? armar(leido.getUTCFullYear() - 1) : d;
}

async function main() {
  const ids = Object.keys(datos.res);
  const compraPorClickup = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase.from("wms_compras").select("id, clickup_id").in("clickup_id", ids.slice(i, i + 300));
    if (error) throw error;
    for (const c of data ?? []) compraPorClickup.set(c.clickup_id, c.id);
  }

  const eventos: Record<string, unknown>[] = [];
  const raras: string[] = [];
  let sinCompra = 0;
  let conEtapa = 0;
  for (const [cid, lineas] of Object.entries(datos.res)) {
    const compraId = compraPorClickup.get(cid);
    if (!compraId) {
      sinCompra++;
      continue;
    }
    // La Actividad viene de la más reciente a la más vieja; dos cambios en el mismo minuto conservan su orden con
    // milisegundos de diferencia.
    const propios = lineas
      .map((l, i) => ({ l, orden: lineas.length - i }))
      .flatMap(({ l, orden }) => {
        if (/^[?!]/.test(l)) {
          raras.push(`${cid}: ${l}`);
          return [];
        }
        const [codigo, cambio, cuando] = l.split("|");
        const [de, a] = cambio.split(">");
        const d = fecha(cuando);
        if (!d) {
          raras.push(`${cid}: fecha «${cuando}»`);
          return [];
        }
        const autor = autorPorCodigo[codigo] ?? null;
        return [
          {
            compra_id: compraId,
            campo: "etapa",
            valor_antes: etapa(de),
            valor_despues: etapa(a),
            ocurrido_en: new Date(d.getTime() + orden).toISOString(),
            autor: autor ? (REASIGNAR[autor] ?? autor) : null,
            origen: "clickup_actividad",
          },
        ];
      });
    if (propios.length) conEtapa++;
    eventos.push(...propios);
  }

  console.log(`Compras leídas: ${ids.length} (sin compra en el sistema: ${sinCompra}), con cambios de Etapa: ${conEtapa}, eventos: ${eventos.length}`);
  if (noReconocidos.size) console.log("Etapas no reconocidas:", Object.fromEntries(noReconocidos));
  if (raras.length) console.log(`Líneas que no se entendieron (${raras.length}):\n` + raras.slice(0, 40).join("\n"));
  if (!aplicar) return console.log("\n(Informe: no se escribió nada. Use --aplicar para guardar.)");

  const compras = [...new Set(eventos.map((e) => e.compra_id as string))];
  for (let i = 0; i < compras.length; i += 200) {
    const { error } = await supabase.from("wms_compra_eventos").delete().in("compra_id", compras.slice(i, i + 200)).eq("campo", "etapa").eq("origen", "clickup_actividad");
    if (error) throw error;
  }
  for (let i = 0; i < eventos.length; i += 500) {
    const { error } = await supabase.from("wms_compra_eventos").upsert(eventos.slice(i, i + 500), { onConflict: "compra_id,campo,valor_despues,ocurrido_en", ignoreDuplicates: true });
    if (error) throw error;
  }
  console.log(`✓ Guardados ${eventos.length} eventos de Etapa.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
