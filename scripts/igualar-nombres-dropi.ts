// Gestión de IDs Dropi (22 oct 2026): iguala UNA VEZ el «Nombre en Dropi» del sistema con el que de verdad tiene Dropi (la última
// lectura de «Mis productos», `dropi_productos_proveedor`). Muchos nombres venían de la lista GCC de ClickUp y nunca se
// actualizaron (uno con 49 caracteres, cuando Dropi admite 40). Desde ahora lo mantiene la lectura diaria (`cambiosDesdeDropi`).
// No toca las publicaciones con un cambio de nombre esperando «Aplicar en Dropi». Cada cambio queda en la actividad, a nombre de
// «Sistema». No manda nada a Dropi: allá ya tienen ese nombre.
//
//   npx tsx scripts/igualar-nombres-dropi.ts            → informe (no escribe)
//   npx tsx scripts/igualar-nombres-dropi.ts --aplicar  → iguala

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { idsDeDropi } from "../src/lib/publicaciones/sincronizar-dropi";

const aplicar = process.argv.includes("--aplicar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const [prov, pubs, pend] = await Promise.all([
    supabase.from("dropi_productos_proveedor").select("pais_id, dropi_producto_id, nombre").limit(20000),
    supabase.from("dropi_publicaciones").select("id, pais_id, nombre, dropi_id").limit(20000),
    supabase.from("dropi_cambios_pendientes").select("publicacion_id").in("estado", ["pendiente", "error"]),
  ]);
  if (prov.error || pubs.error) throw new Error(prov.error?.message ?? pubs.error?.message);
  const nombreEnDropi = new Map((prov.data ?? []).map((p) => [`${p.pais_id}|${p.dropi_producto_id}`, String(p.nombre).trim()]));
  const pendientes = new Set(((pend.data ?? []) as { publicacion_id: string }[]).map((x) => x.publicacion_id));
  const cambios: { id: string; antes: string; despues: string }[] = [];
  let conPendiente = 0;
  const conCodigo: string[] = [];
  for (const p of pubs.data ?? []) {
    const id = idsDeDropi(p.dropi_id).find((i) => nombreEnDropi.has(`${p.pais_id}|${i}`));
    if (id === undefined) continue;
    const despues = nombreEnDropi.get(`${p.pais_id}|${id}`)!;
    const antes = String(p.nombre ?? "").trim();
    if (!despues || despues === antes) continue;
    // Un nombre de Dropi con forma de código de SKU («SHILAJIT/GOLD/GOMITAS (B280)») es el mismo error de los SKU cambiados en
    // Dropi: no se copia al sistema (queda el nombre de antes, para devolvérselo a Dropi).
    if (despues.includes("/")) {
      conCodigo.push(`${id}: «${despues}» (sistema: «${antes}»)`);
      continue;
    }
    if (pendientes.has(p.id)) {
      conPendiente++;
      continue;
    }
    cambios.push({ id: p.id, antes, despues });
  }
  console.log(`${cambios.length} nombres para igualar con Dropi (${cambios.filter((c) => c.antes.length > 40).length} pasaban de 40 caracteres); ${conPendiente} con un cambio esperando «Aplicar en Dropi» (no se tocan).`);
  for (const c of cambios.slice(0, 8)) console.log(`  «${c.antes}» → «${c.despues}»`);
  console.log(`${conCodigo.length} con nombre de código en Dropi (no se tocan):`);
  for (const c of conCodigo) console.log(`  ${c}`);
  if (!aplicar) return console.log("Con --aplicar se igualan.");

  const ahora = new Date().toISOString();
  for (const c of cambios) {
    const { error } = await supabase.from("dropi_publicaciones").update({ nombre: c.despues, actualizado_en: ahora }).eq("id", c.id);
    if (error) throw new Error(`${c.antes}: ${error.message}`);
  }
  for (let i = 0; i < cambios.length; i += 200) {
    const { error } = await supabase.from("historial_auditoria").insert(
      cambios.slice(i, i + 200).map((c) => ({
        usuario_id: null,
        usuario_nombre: "Sistema",
        accion: "igualar_nombre_dropi",
        entidad: "dropi_publicaciones",
        entidad_id: c.id,
        antes: { "Nombre en Dropi": c.antes },
        despues: { "Nombre en Dropi": c.despues },
      })),
    );
    if (error) throw new Error(`Actividad: ${error.message}`);
  }
  console.log(`Igualados ${cambios.length}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
