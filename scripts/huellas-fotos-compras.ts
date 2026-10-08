// Huella (dHash de 64 bits) de las fotos de los productos y de las fotos de las compras sin productos. Solo lee.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SALIDA = "datos-privados/huellas-fotos.json";
const huellas: Record<string, string> = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, "utf8")) : {};
async function dhash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).rotate().flatten({ background: "#ffffff" }).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? "1" : "0";
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}
(async () => {
  const { data: prods } = await s.from("skus_maestros").select("id, foto_url").not("foto_url", "is", null);
  const compras: any[] = [];
  for (let i = 0; ; i += 1000) { const { data } = await s.from("wms_compras").select("id, tipo, wms_compra_items(count)").order("numero").range(i, i + 999); compras.push(...data!); if (data!.length < 1000) break; }
  const objetivo = new Set(compras.filter(c => c.tipo === "pais" && !(c.wms_compra_items?.[0]?.count > 0)).map(c => c.id));
  const adj: any[] = [];
  for (let i = 0; ; i += 1000) { const { data } = await s.from("wms_compra_adjuntos").select("id, compra_id, origen, ruta, creado_en").eq("clase", "foto").not("ruta", "is", null).order("creado_en").range(i, i + 999); adj.push(...data!); if (data!.length < 1000) break; }
  const porCompra = new Map<string, any[]>();
  for (const a of adj) if (objetivo.has(a.compra_id)) porCompra.set(a.compra_id, [...(porCompra.get(a.compra_id) ?? []), a]);
  const tareas: { clave: string; obtener: () => Promise<Buffer> }[] = [];
  for (const p of prods!) tareas.push({ clave: `p:${p.id}`, obtener: async () => Buffer.from(await (await fetch(p.foto_url)).arrayBuffer()) });
  for (const [cid, lista] of porCompra) {
    const orden = [...lista.filter(a => a.origen === "campo_foto"), ...lista.filter(a => a.origen !== "campo_foto")].slice(0, 6);
    for (const a of orden) tareas.push({ clave: `c:${cid}:${a.id}`, obtener: async () => { const { data, error } = await s.storage.from("wms-compras").download(a.ruta); if (error) throw error; return Buffer.from(await data.arrayBuffer()); } });
  }
  const pendientes = tareas.filter(t => !huellas[t.clave]);
  console.log("tareas", tareas.length, "pendientes", pendientes.length);
  let n = 0, fallos = 0, sig = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (sig < pendientes.length) {
      const t = pendientes[sig++];
      try { huellas[t.clave] = await dhash(await t.obtener()); } catch { fallos++; }
      if (++n % 200 === 0) { writeFileSync(SALIDA, JSON.stringify(huellas)); console.log(n, "de", pendientes.length); }
    }
  }));
  writeFileSync(SALIDA, JSON.stringify(huellas));
  console.log("listo", Object.keys(huellas).length, "fallos", fallos);
})();
