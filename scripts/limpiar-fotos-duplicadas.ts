// Gestión de IDs Dropi › Fotos: quita las copias repetidas de una misma foto (28 oct 2026, PUB-0446: 17 «Principal» iguales porque Dropi le
// antepone un número de subida al nombre y cada subida parecía una foto nueva). Se queda una copia por foto (la que sigue en Dropi, la
// principal, la de menor orden) y borra las demás filas de `dropi_publicacion_fotos` y sus archivos de Storage si nadie más los usa.
// Solo toca las copias del sistema: no cambia nada en Dropi. La lectura diaria de «Mis productos» hace lo mismo sola con las publicaciones
// que lee; esto sirve para limpiar de una vez.
// Uso: npx tsx scripts/limpiar-fotos-duplicadas.ts [--aplicar]   (sin --aplicar solo informa)

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { repetidasDe, rutasSinUso, type FotoGuardada } from "../src/lib/publicaciones/fotos-dropi";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-productos";
const aplicar = process.argv.includes("--aplicar");

(async () => {
  const porPublicacion = new Map<string, FotoGuardada[]>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("dropi_publicacion_fotos").select("publicacion_id, nombre, principal, orden, en_dropi, ruta").order("publicacion_id").order("orden").range(desde, desde + 999);
    if (error) throw new Error(`${error.message} (¿falta la migración 0153?)`);
    for (const f of data ?? [])
      porPublicacion.set(f.publicacion_id as string, [...(porPublicacion.get(f.publicacion_id as string) ?? []), { nombre: f.nombre as string, principal: !!f.principal, orden: Number(f.orden), enDropi: !!f.en_dropi, ruta: f.ruta as string }]);
    if (!data || data.length < 1000) break;
  }

  const numeros = new Map<string, { numero: number; dropiId: string; nombre: string; estado: string }>();
  for (let i = 0; i < [...porPublicacion.keys()].length; i += 200) {
    const ids = [...porPublicacion.keys()].slice(i, i + 200);
    const { data } = await supabase.from("dropi_publicaciones").select("id, numero, dropi_id, nombre, estado_publicacion").in("id", ids);
    for (const p of data ?? []) numeros.set(p.id as string, { numero: Number(p.numero), dropiId: String(p.dropi_id ?? "sin ID"), nombre: String(p.nombre ?? ""), estado: String(p.estado_publicacion ?? "") });
  }

  let publicaciones = 0;
  let filasQuitadas = 0;
  let archivos = 0;
  const detalle: string[] = [];
  for (const [id, fotos] of porPublicacion) {
    const { conservar, repetidas } = repetidasDe(fotos);
    if (!repetidas.length) continue;
    publicaciones++;
    filasQuitadas += repetidas.length;
    const rutas = rutasSinUso(repetidas, conservar.values());
    archivos += rutas.length;
    const pub = numeros.get(id);
    detalle.push(`PUB-${String(pub?.numero ?? "?").padStart(4, "0")} · ID Dropi ${pub?.dropiId ?? "?"} · ${pub?.estado ?? ""} · ${pub?.nombre ?? ""}: ${fotos.length} fotos en Dropi, ${conservar.size} distintas, ${repetidas.length} repetidas`);
    if (!aplicar) continue;
    const { error } = await supabase.from("dropi_publicacion_fotos").delete().eq("publicacion_id", id).in("nombre", repetidas.map((r) => r.nombre));
    if (error) {
      console.error(`${id}: ${error.message}`);
      continue;
    }
    if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas);
  }

  console.log(detalle.sort().join("\n") || "Ninguna publicación tiene fotos repetidas.");
  console.log(`\n${publicaciones} publicaciones con repetidas · ${filasQuitadas} copias repetidas · ${archivos} archivos de Storage.`);
  if (!aplicar) console.log("Sin --aplicar no se cambió nada.");
})();
