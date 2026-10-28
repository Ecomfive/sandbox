// Gestión de IDs Dropi › Fotos: junta las copias repetidas de una misma foto (28 oct 2026, PUB-0446: 17 «Principal» iguales). Compara
// por contenido, no por nombre: las 17 tenían 17 nombres al azar distintos y eran el mismo archivo. Usa la huella md5 que Storage da de
// cada archivo (`eTag`): los archivos iguales de una publicación quedan en uno solo, con su huella de nombre (como los guarda ahora la
// lectura diaria), las filas apuntan a ese y se borran las copias que sobran (`planUnificar`). Las filas no se borran: siguen siendo las
// fotos que Dropi lista, la ficha y la republicación las muestran y suben una sola vez (`unaPorFoto`). No cambia nada en Dropi: el
// informe dice qué publicaciones tienen la misma foto varias veces en Dropi, para borrarlas allá a mano.
// Uso: npx tsx scripts/limpiar-fotos-duplicadas.ts [--aplicar]   (sin --aplicar solo informa)

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { planUnificar } from "../src/lib/publicaciones/fotos-dropi";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-productos";
const aplicar = process.argv.includes("--aplicar");

type Fila = { nombre: string; ruta: string | null; enDropi: boolean };

/** La huella md5 de cada archivo de una carpeta, según Storage (`null` si el eTag no es un md5, como en una subida por partes). */
async function huellas(carpeta: string, en: Map<string, string | null>) {
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, { limit: 1000, offset: desde });
    if (error) throw new Error(`${carpeta}: ${error.message}`);
    for (const o of data ?? []) {
      const etag = String((o.metadata as { eTag?: string } | null)?.eTag ?? "").replace(/"/g, "").toLowerCase();
      en.set(`${carpeta}/${o.name}`, /^[0-9a-f]{32}$/.test(etag) ? etag : null);
    }
    if (!data || data.length < 1000) break;
  }
}

(async () => {
  const porPublicacion = new Map<string, Fila[]>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("dropi_publicacion_fotos").select("publicacion_id, nombre, en_dropi, ruta").order("publicacion_id").order("orden").range(desde, desde + 999);
    if (error) throw new Error(`${error.message} (¿falta la migración 0153?)`);
    for (const f of data ?? [])
      porPublicacion.set(f.publicacion_id as string, [...(porPublicacion.get(f.publicacion_id as string) ?? []), { nombre: f.nombre as string, ruta: (f.ruta as string | null) ?? null, enDropi: !!f.en_dropi }]);
    if (!data || data.length < 1000) break;
  }

  const huellaDe = new Map<string, string | null>();
  const carpetas = new Set([...porPublicacion.values()].flat().map((f) => f.ruta?.split("/").slice(0, -1).join("/")).filter((c): c is string => !!c));
  for (const c of carpetas) await huellas(c, huellaDe);

  const numeros = new Map<string, { numero: number; dropiId: string; nombre: string; estado: string }>();
  const ids = [...porPublicacion.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("dropi_publicaciones").select("id, numero, dropi_id, nombre, estado_publicacion").in("id", ids.slice(i, i + 200));
    for (const p of data ?? []) numeros.set(p.id as string, { numero: Number(p.numero), dropiId: String(p.dropi_id ?? "sin ID"), nombre: String(p.nombre ?? ""), estado: String(p.estado_publicacion ?? "") });
  }

  let publicaciones = 0;
  let copiasEnDropi = 0;
  let archivos = 0;
  let sinHuella = 0;
  const detalle: string[] = [];
  for (const [id, fotos] of porPublicacion) {
    sinHuella += fotos.filter((f) => !f.ruta || !huellaDe.get(f.ruta)).length;
    // Lo que Dropi lista hoy: cuántas fotos y cuántas distintas.
    const enDropi = fotos.filter((f) => f.enDropi);
    const distintasEnDropi = planUnificar(id, enDropi, huellaDe).distintas;
    const plan = planUnificar(id, fotos, huellaDe);
    archivos += plan.borrar.length;
    if (enDropi.length > distintasEnDropi) {
      publicaciones++;
      copiasEnDropi += enDropi.length - distintasEnDropi;
      const pub = numeros.get(id);
      detalle.push(`PUB-${String(pub?.numero ?? "?").padStart(4, "0")} · ID Dropi ${pub?.dropiId ?? "?"} · ${pub?.estado ?? ""} · ${pub?.nombre ?? ""}: ${enDropi.length} fotos en Dropi, ${distintasEnDropi} distintas, ${enDropi.length - distintasEnDropi} repetidas`);
    }
    if (!aplicar || (!plan.mover.length && !plan.cambiarRuta.length && !plan.borrar.length)) continue;
    // 1) El archivo que queda pasa a llamarse como su huella; 2) las filas apuntan a él; 3) se borran las copias que sobran.
    let bien = true;
    for (const m of plan.mover) {
      const { error } = await supabase.storage.from(BUCKET).move(m.desde, m.hacia);
      if (error) {
        console.error(`${id} ${m.desde}: ${error.message}`);
        bien = false;
      }
    }
    if (!bien) continue;
    for (const c of plan.cambiarRuta) {
      const url = supabase.storage.from(BUCKET).getPublicUrl(c.ruta).data.publicUrl;
      const { error } = await supabase.from("dropi_publicacion_fotos").update({ ruta: c.ruta, url, actualizado_en: new Date().toISOString() }).eq("publicacion_id", id).eq("nombre", c.nombre);
      if (error) {
        console.error(`${id} ${c.nombre}: ${error.message}`);
        bien = false;
      }
    }
    if (bien && plan.borrar.length) await supabase.storage.from(BUCKET).remove(plan.borrar);
  }

  console.log(detalle.sort().join("\n") || "Ninguna publicación tiene fotos repetidas en Dropi.");
  console.log(`\n${publicaciones} publicaciones con la misma foto varias veces en Dropi · ${copiasEnDropi} copias para borrar en Dropi · ${archivos} archivos repetidos en Storage.`);
  if (sinHuella) console.log(`${sinHuella} fotos sin huella en Storage (no se compararon).`);
  if (!aplicar) console.log("Sin --aplicar no se cambió nada.");
})();
