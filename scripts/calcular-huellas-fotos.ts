// Calcula la huella (dHash) de la foto de cada producto que todavía no la tiene (`skus_maestros.foto_huella`, migración 0103),
// para el aviso de posible duplicado al crear un producto. Se puede repetir: solo toca los que faltan.
// Uso: npx tsx scripts/calcular-huellas-fotos.ts [--aplicar]   (sin --aplicar solo cuenta)

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { huellaFoto } from "../src/lib/wms/huella-foto";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-productos";
const PREFIJO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const aplicar = process.argv.includes("--aplicar");

async function bytesDe(url: string): Promise<Uint8Array | null> {
  try {
    if (url.startsWith(PREFIJO)) {
      const { data } = await supabase.storage.from(BUCKET).download(decodeURIComponent(url.slice(PREFIJO.length).split("?")[0]));
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    }
    if (!/^https?:\/\//.test(url)) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

(async () => {
  const filas: { id: string; codigo: string; foto_url: string }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("skus_maestros").select("id, codigo, foto_url").not("foto_url", "is", null).is("foto_huella", null).order("id").range(desde, desde + 999);
    if (error) throw new Error(`${error.message} (¿falta la migración 0103?)`);
    filas.push(...(data as typeof filas));
    if (!data || data.length < 1000) break;
  }
  console.log(`${filas.length} productos con foto y sin huella.`);
  if (!aplicar) return console.log("Sin --aplicar no se cambia nada.");

  let hechos = 0;
  const fallidos: string[] = [];
  for (let i = 0; i < filas.length; i += 8) {
    await Promise.all(
      filas.slice(i, i + 8).map(async (f) => {
        const bytes = await bytesDe(f.foto_url);
        const huella = bytes ? await huellaFoto(bytes) : null;
        if (!huella) return void fallidos.push(f.codigo);
        const { error } = await supabase.from("skus_maestros").update({ foto_huella: huella }).eq("id", f.id);
        if (error) fallidos.push(f.codigo);
        else hechos++;
      }),
    );
  }
  console.log(`Listo: ${hechos} huellas calculadas, ${fallidos.length} sin poder leer la foto.`);
  if (fallidos.length) console.log(fallidos.slice(0, 30).join(", "));
})();
