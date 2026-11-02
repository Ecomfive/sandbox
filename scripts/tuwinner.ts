// Tu Winner desde la consola (2 nov 2026), para la primera carga y para una tarea programada con el navegador:
//   npx tsx scripts/tuwinner.ts subida   → imprime { id, subida: { tuwinner } }: la dirección firmada (2 horas) para el lector
//   (en la pestaña de app.tuwinner.com con la sesión de Ecomfive: pegar scripts/tuwinner-navegador.js y correr leerTuWinner(subida))
//   npx tsx scripts/tuwinner.ts cargar <id> → guarda lo que subió el lector (lo mismo que «Leer ahora» del panel)
process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { ingerirLectura } from "../src/lib/tuwinner/ingerir";
import { leerLectura } from "../src/lib/tuwinner/tuwinner";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-compras";
const CARPETA = "tmp-dropi-panel";

async function subida() {
  const { data, error } = await supabase.from("tuwinner_lecturas").insert({ iniciado_por_nombre: "Consola" }).select("id").single();
  if (error || !data) throw new Error(`No se pudo anotar la lectura (¿falta la migración 0223?): ${error?.message}`);
  const { data: s, error: e } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${data.id}/tuwinner.json`, { upsert: true });
  if (e || !s) throw new Error(`No se pudo preparar la subida: ${e?.message}`);
  console.log(JSON.stringify({ id: data.id, subida: { tuwinner: s.signedUrl } }));
}

async function cargar(id: string) {
  const ruta = `${CARPETA}/${id}/tuwinner.json`;
  const { data: archivo, error } = await supabase.storage.from(BUCKET).download(ruta);
  if (error || !archivo) throw new Error("No llegó la lectura.");
  const lectura = leerLectura(JSON.parse(await archivo.text()));
  if (!lectura) throw new Error("La lectura llegó vacía o con otro formato.");
  try {
    const r = await ingerirLectura(supabase, lectura);
    await supabase.from("tuwinner_lecturas").update({ estado: "listo", fin: new Date().toISOString(), resumen: r.resumen }).eq("id", id);
    await supabase.storage.from(BUCKET).remove([ruta]);
    console.log(`Guardado: ${JSON.stringify(r.resumen)} · ${r.eventos} cambios anotados.`);
  } catch (e) {
    await supabase.from("tuwinner_lecturas").update({ estado: "error", fin: new Date().toISOString(), error: String(e).slice(0, 500) }).eq("id", id);
    throw e;
  }
}

const [, , orden, id] = process.argv;
(orden === "subida" ? subida() : orden === "cargar" && id ? cargar(id) : Promise.reject(new Error("Uso: npx tsx scripts/tuwinner.ts subida | cargar <id>"))).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
