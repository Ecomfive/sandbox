// Gestión de IDs Dropi (22 oct 2026): devuelve el nombre de verdad a las publicaciones a las que, en Dropi, se les puso el código del
// SKU como nombre (pasó después de la migración 0114 del 20 oct, al cambiar los SKU en Dropi). Toma la lista revisada por Alcides
// (datos-privados/nombres-propuestos-dropi.csv: «ID Dropi», «Publicación», «Nombre propuesto»), guarda el nombre en el sistema y lo
// deja en la cola de «Aplicar en Dropi» con el SKU como nombre de la guía. En Dropi no cambia nada hasta pulsar el favorito.
//
//   npx tsx scripts/restaurar-nombres-dropi.ts [lista.csv]            → informe (no escribe)
//   npx tsx scripts/restaurar-nombres-dropi.ts [lista.csv] --aplicar  → guarda y deja en la cola
// La lista lleva «ID Dropi» y «Nombre propuesto» («Publicación» es opcional: sin ella se busca por el ID de Dropi, y si dos
// publicaciones tienen el mismo ID se les pone el nombre a las dos y va una sola vez a la cola).

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { MAX_NOMBRE_DROPI } from "../src/lib/publicaciones/dropi-guardado";
import { idsDeDropi } from "../src/lib/publicaciones/sincronizar-dropi";

const aplicar = process.argv.includes("--aplicar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function leerCsv(ruta: string): Record<string, string>[] {
  const texto = readFileSync(ruta, "utf8").replace(/^﻿/, "");
  const filas = texto.split(/\r?\n/).filter(Boolean).map((l) => (l.match(/("([^"]|"")*"|[^;]*)(;|$)/g) ?? []).map((c) => c.replace(/;$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1));
  const [cab, ...resto] = filas;
  return resto.map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i] ?? ""])));
}

async function main() {
  const lista = leerCsv(process.argv.slice(2).find((a) => a.endsWith(".csv")) ?? "datos-privados/nombres-propuestos-dropi.csv");
  const { data: yo } = await supabase.from("perfiles").select("id, nombre").eq("email", "aandrade@ecomfive.io").maybeSingle();
  const pubs = (await supabase.from("dropi_publicaciones").select("id, pais_id, numero, nombre, dropi_id, sku_maestro_id").limit(5000)).data ?? [];
  const skus = new Map(((await supabase.from("skus_maestros").select("id, codigo").limit(5000)).data ?? []).map((s) => [s.id as string, String(s.codigo)]));
  const plan: { pub: (typeof pubs)[number]; otras: (typeof pubs)[number][]; dropiId: number; nombre: string; guia: string | null }[] = [];
  for (const f of lista) {
    const dropiId = Number(f["ID Dropi"]);
    const nombre = (f["Nombre propuesto"] ?? "").trim();
    if (!nombre) continue;
    const numero = Number((f["Publicación"] ?? "").replace(/\D/g, ""));
    const conId = pubs.filter((p) => idsDeDropi(p.dropi_id).includes(dropiId));
    const pub = (numero ? conId.find((p) => Number(p.numero) === numero) : null) ?? conId[0];
    if (!pub || nombre.length > MAX_NOMBRE_DROPI) throw new Error(`Fila no válida: ${JSON.stringify(f)}`);
    const codigo = pub.sku_maestro_id ? skus.get(pub.sku_maestro_id as string) ?? null : null;
    plan.push({ pub, otras: conId.filter((p) => p.id !== pub.id), dropiId, nombre, guia: codigo && codigo.length <= MAX_NOMBRE_DROPI ? codigo : null });
  }
  console.log(`${plan.length} nombres para restaurar y dejar en la cola de «Aplicar en Dropi».`);
  for (const p of plan.slice(0, 5)) console.log(`  ${p.dropiId}: «${p.pub.nombre}» → «${p.nombre}» (guía: ${p.guia ?? "—"})`);
  if (!aplicar) return console.log("Con --aplicar se guardan y quedan en la cola.");

  const por = { id: (yo?.id as string | undefined) ?? null, nombre: `${(yo?.nombre as string | undefined) ?? "Alcides Andrade"} (restauración de nombres)` };
  const ahora = new Date().toISOString();
  for (const p of plan) {
    await supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("publicacion_id", p.pub.id).in("estado", ["pendiente", "error"]);
    const { error: e1 } = await supabase.from("dropi_cambios_pendientes").insert({ pais_id: p.pub.pais_id, publicacion_id: p.pub.id, dropi_producto_id: p.dropiId, nombre: p.nombre, nombre_guia: p.guia, creado_por: por.id, creado_por_nombre: por.nombre });
    if (e1) throw new Error(`Cola ${p.dropiId}: ${e1.message}`);
    const { error: e2 } = await supabase.from("dropi_publicaciones").update({ nombre: p.nombre, actualizado_en: ahora }).in("id", [p.pub.id, ...p.otras.map((o) => o.id)]);
    if (e2) throw new Error(`Publicación ${p.dropiId}: ${e2.message}`);
  }
  const { error } = await supabase.from("historial_auditoria").insert(
    plan.map((p) => ({
      usuario_id: por.id,
      usuario_nombre: yo?.nombre ?? "Alcides Andrade",
      accion: "restaurar_nombre_dropi",
      entidad: "dropi_publicaciones",
      entidad_id: p.pub.id,
      detalle: `En Dropi el nombre había quedado igual al SKU («${p.guia ?? "—"}»). Nombre devuelto: «${p.nombre}» (antes en el sistema: «${String(p.pub.nombre).trim()}»). Pendiente de «Aplicar en Dropi».`,
    })),
  );
  if (error) throw new Error(`Actividad: ${error.message}`);
  console.log(`Listo: ${plan.length} en la cola de «Aplicar en Dropi».`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
