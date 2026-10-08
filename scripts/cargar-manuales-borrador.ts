// Carga una vez los manuales de proceso borrador (src/lib/ayuda/manuales-borrador.ts) en `manuales_proceso` (migración
// 0088). No repite uno que ya exista con el mismo título. Después se editan desde Ayuda › Manuales.
//   npx tsx scripts/cargar-manuales-borrador.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { MANUALES_BORRADOR } from "../src/lib/ayuda/manuales-borrador";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: existentes, error } = await supabase.from("manuales_proceso").select("titulo");
  if (error) throw new Error(`${error.message} (¿falta la migración 0088?)`);
  const ya = new Set((existentes ?? []).map((m) => m.titulo));
  const nuevos = MANUALES_BORRADOR.filter((m) => !ya.has(m.titulo)).map((m) => ({ ...m, borrador: true, actualizado_por: "Borrador inicial" }));
  if (nuevos.length) {
    const { error: e } = await supabase.from("manuales_proceso").insert(nuevos);
    if (e) throw e;
  }
  console.log(`Manuales cargados: ${nuevos.length} (ya estaban: ${ya.size}).`);
})();
