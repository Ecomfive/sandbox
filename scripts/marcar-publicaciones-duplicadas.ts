// Gestión de IDs Dropi (23 oct 2026, pedido de Hernán; migración 0147): marca UNA VEZ las publicaciones repetidas que entraron al
// importar ClickUp (dos tareas con el mismo ID de Dropi escrito, no dos productos en Dropi). En cada grupo con los mismos IDs de
// Dropi en el mismo país queda la que está al día (estado distinto de «archivado»; si hay más de una, o ninguna, la más nueva) y las
// otras pasan a `duplicada_de` = esa, con estado «archivado» y enlazadas en «Relacionados». No se borra nada ni se toca Dropi. Cada
// cambio queda en la actividad, a nombre de «Sistema». Se puede correr de nuevo: las ya marcadas no cuentan.
//
//   npx tsx scripts/marcar-publicaciones-duplicadas.ts            → informe (no escribe)
//   npx tsx scripts/marcar-publicaciones-duplicadas.ts --aplicar  → marca

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { numeroPublicacion } from "../src/lib/publicaciones/publicacion";
import { idsDeDropi } from "../src/lib/publicaciones/sincronizar-dropi";

const aplicar = process.argv.includes("--aplicar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Pub = { id: string; numero: number | null; pais_id: string; nombre: string; dropi_id: string | null; estado: string; relacionados: string[] | null; creado_en: string; duplicada_de: string | null };

async function main() {
  const { data, error } = await supabase
    .from("dropi_publicaciones")
    .select("id, numero, pais_id, nombre, dropi_id, estado, relacionados, creado_en, duplicada_de")
    .not("dropi_id", "is", null)
    .limit(20000);
  if (error) throw new Error(/duplicada_de/.test(error.message) ? "Falta correr en Supabase la migración 0147." : error.message);
  const grupos = new Map<string, Pub[]>();
  for (const p of (data ?? []) as Pub[]) {
    if (p.duplicada_de) continue;
    const ids = [...new Set(idsDeDropi(p.dropi_id))].sort((a, b) => a - b).join("/");
    if (!ids) continue;
    const k = `${p.pais_id}|${ids}`;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  const marcas: { dup: Pub; queda: Pub }[] = [];
  for (const [k, pubs] of grupos) {
    if (pubs.length < 2) continue;
    const orden = [...pubs].sort((a, b) => Number(b.estado !== "archivado") - Number(a.estado !== "archivado") || b.creado_en.localeCompare(a.creado_en));
    const [queda, ...resto] = orden;
    console.log(`ID ${k.split("|")[1]}: queda ${numeroPublicacion(queda.numero)} (${queda.estado}) · duplicadas ${resto.map((r) => `${numeroPublicacion(r.numero)} (${r.estado})`).join(", ")} · ${queda.nombre}`);
    for (const dup of resto) marcas.push({ dup, queda });
  }
  console.log(`\n${marcas.length} publicaciones para marcar como duplicadas.`);
  if (!aplicar) return console.log("Con --aplicar se marcan.");

  const ahora = new Date().toISOString();
  const relacionados = new Map<string, Set<string>>();
  const de = (p: Pub) => relacionados.get(p.id) ?? relacionados.set(p.id, new Set(p.relacionados ?? [])).get(p.id)!;
  for (const { dup, queda } of marcas) {
    de(dup).add(queda.id);
    de(queda).add(dup.id);
  }
  for (const { dup, queda } of marcas) {
    const { error: e } = await supabase
      .from("dropi_publicaciones")
      .update({ duplicada_de: queda.id, estado: "archivado", relacionados: [...de(dup)], actualizado_en: ahora })
      .eq("id", dup.id)
      .is("duplicada_de", null);
    if (e) throw new Error(`${numeroPublicacion(dup.numero)}: ${e.message}`);
  }
  for (const { queda } of marcas) {
    const { error: e } = await supabase.from("dropi_publicaciones").update({ relacionados: [...de(queda)] }).eq("id", queda.id);
    if (e) throw new Error(`${numeroPublicacion(queda.numero)}: ${e.message}`);
  }
  const { error: ea } = await supabase.from("historial_auditoria").insert(
    marcas.flatMap(({ dup, queda }) => [
      {
        usuario_id: null,
        usuario_nombre: "Sistema",
        accion: "marcar_publicacion_duplicada",
        entidad: "dropi_publicaciones",
        entidad_id: dup.id,
        antes: { Estado: dup.estado },
        despues: { Estado: "archivado", "Duplicada de": `${numeroPublicacion(queda.numero)} · ${queda.nombre} (mismo ID de Dropi ${queda.dropi_id})` },
      },
      {
        usuario_id: null,
        usuario_nombre: "Sistema",
        accion: "marcar_publicacion_duplicada",
        entidad: "dropi_publicaciones",
        entidad_id: queda.id,
        antes: {},
        despues: { "Tiene una duplicada": `${numeroPublicacion(dup.numero)} (mismo ID de Dropi ${queda.dropi_id}), que pasó a Archivados` },
      },
    ]),
  );
  if (ea) throw new Error(`Actividad: ${ea.message}`);
  console.log(`Marcadas ${marcas.length}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
