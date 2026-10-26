// Dropi al sistema, cada mañana (tarea programada «dropi-diario»): el navegador lee en app.dropi.pa, con la sesión de ECOMFIVE,
// pedidos (30 días), cartera (7 días), retiros y stock (`scripts/dropi-diario-navegador.js`) y los sube a una carpeta temporal del
// bucket privado `wms-compras`; este script da las direcciones de subida, después baja las lecturas y las guarda con los cargadores
// de siempre (todos idempotentes: volver a correrlo no duplica nada).
//
//   npx tsx scripts/dropi-diario.ts subida          → imprime { pedidos, cartera, retiros, stock }: direcciones firmadas (2 horas)
//   npx tsx scripts/dropi-diario.ts cargar          → baja la última lectura, borra los temporales y la carga:
//        pedidos → dropi-ingerir-ordenes.ts (Pedidos Dropi, CRM) · cartera → dropi-ingerir-cartera.ts · retiros y saldo →
//        dropi-ingerir-retiros.ts · stock → guardarNuestrosProductos (Gestión de IDs Dropi). Luego limpia las copias viejas de
//        `staging_ordenes_dropi` (migración 0133) y deja la sesión como renovada en el Centro de notificaciones.
//   npx tsx scripts/dropi-diario.ts cuadre <AAAA-MM-DD>  → pedidos de ese día en el sistema por estado (JSON), para cuadrarlos
//        con lo que da el MCP de Dropi
//   npx tsx scripts/dropi-diario.ts sesion-vencida  → deja en el Centro de notificaciones que la sesión de Dropi Panamá expiró

process.loadEnvFile(".env.local");
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { guardarNuestrosProductos, type LecturaNuestros } from "./publicaciones-sincronizar-dropi";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-compras";
const CARPETA = "tmp-dropi-diario";
const TIPOS = ["pedidos", "cartera", "retiros", "stock"] as const;
const DESTINO = ".dropi-downloads/diario";

async function subida() {
  const sello = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const out: Record<string, string> = {};
  for (const tipo of TIPOS) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${sello}-${tipo}.json`, { upsert: true });
    if (error) throw new Error(`No se pudo preparar la subida: ${error.message}`);
    out[tipo] = data.signedUrl;
  }
  console.log(JSON.stringify(out));
}

/** Corre un cargador de siempre con el archivo bajado; devuelve si terminó bien (su salida se ve tal cual). */
function correr(script: string, ...args: string[]): boolean {
  console.log(`\n— ${script} ${args.join(" ")}`);
  const r = spawnSync(process.execPath, [require.resolve("tsx/cli"), join(__dirname, script), ...args], { stdio: "inherit" });
  return r.status === 0;
}

async function marcarSesion(ok: boolean, mensaje: string) {
  const { error } = await supabase.from("dropi_sesiones").upsert({ pais_codigo: "PA", tipo: "proveedor", renovada_en: new Date().toISOString(), ok, mensaje });
  if (error) console.warn(`Aviso: no se guardó el estado de la sesión (${error.message}).`);
}

async function cargar() {
  const { data: lista, error } = await supabase.storage.from(BUCKET).list(CARPETA, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(error.message);
  const nombres = (lista ?? []).map((f) => f.name);
  const sello = nombres.find((n) => TIPOS.every((t) => nombres.includes(n.replace(/-[a-z]+\.json$/, `-${t}.json`))))?.replace(/-[a-z]+\.json$/, "");
  if (!sello) throw new Error("No hay ninguna lectura completa subida (falta correr la función del navegador o falló la subida).");

  mkdirSync(DESTINO, { recursive: true });
  const archivos: Record<string, string> = {};
  const lecturas: Record<string, unknown> = {};
  for (const tipo of TIPOS) {
    const { data, error: e } = await supabase.storage.from(BUCKET).download(`${CARPETA}/${sello}-${tipo}.json`);
    if (e || !data) throw new Error(`No se pudo bajar ${tipo}: ${e?.message}`);
    lecturas[tipo] = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  }
  // Los pedidos se guardan como los espera el cargador: la lista sola.
  const lp = lecturas.pedidos as { desde: string; hasta: string; pedidos: unknown[] };
  for (const [tipo, contenido] of [["pedidos", lp.pedidos], ["cartera", lecturas.cartera], ["retiros", lecturas.retiros], ["stock", lecturas.stock]] as const) {
    archivos[tipo] = join(DESTINO, `${sello}-${tipo}.json`);
    writeFileSync(archivos[tipo], JSON.stringify(contenido));
  }
  // Los temporales (también los de lecturas viejas que hayan quedado) se borran: el bucket no es para esto.
  const { error: eb } = await supabase.storage.from(BUCKET).remove(nombres.map((n) => `${CARPETA}/${n}`));
  if (eb) console.warn(`Aviso: no se borraron los temporales (${eb.message}).`);
  console.log(`Lectura ${sello}: ${lp.pedidos.length} pedidos (${lp.desde} a ${lp.hasta}), ${(lecturas.cartera as unknown[]).length} movimientos de cartera, ${(lecturas.retiros as unknown[]).length} retiros, ${(lecturas.stock as LecturaNuestros).productos.length} productos.`);

  const fallos: string[] = [];
  if (!correr("dropi-ingerir-ordenes.ts", "pa", archivos.pedidos)) fallos.push("pedidos");
  if (!correr("dropi-ingerir-cartera.ts", "pa", archivos.cartera)) fallos.push("cartera");
  if (!correr("dropi-ingerir-retiros.ts", "pa", archivos.retiros)) fallos.push("retiros");
  console.log("\n— stock (Gestión de IDs Dropi)");
  try {
    const r = await guardarNuestrosProductos(supabase, lecturas.stock as LecturaNuestros, true);
    console.dir(r, { depth: 1 });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    fallos.push("stock");
  }

  // Las copias viejas de los pedidos en bruto las borra `ingerirPedidos` (dropi-ingerir-ordenes.ts) después de guardarlos.

  await marcarSesion(true, fallos.length ? `Actualización diaria con fallos: ${fallos.join(", ")}` : "Actualización diaria");
  if (fallos.length) {
    console.error(`\nTerminó con fallos en: ${fallos.join(", ")}.`);
    process.exit(1);
  }
  console.log("\nCargado.");
}

/** Pedidos creados ese día (Panamá, Dropi) por estado, para cuadrarlos con el MCP de Dropi. */
async function cuadre(dia: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error("Uso: npx tsx scripts/dropi-diario.ts cuadre AAAA-MM-DD");
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", "PA").single();
  const { data: plataforma } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!pais || !plataforma) throw new Error("Falta el país PA o la plataforma Dropi.");
  const porEstado: Record<string, number> = {};
  const ids: string[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("ordenes")
      .select("referencia_externa, estado")
      .eq("pais_id", pais.id)
      .eq("plataforma_id", plataforma.id)
      .eq("fecha", dia)
      .order("referencia_externa")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const o of data ?? []) {
      porEstado[o.estado] = (porEstado[o.estado] ?? 0) + 1;
      ids.push(o.referencia_externa);
    }
    if ((data ?? []).length < 1000) break;
  }
  console.log(JSON.stringify({ dia, total: ids.length, porEstado, ids }));
}

const [orden, arg] = process.argv.slice(2);
const acciones: Record<string, () => Promise<void>> = {
  subida,
  cargar,
  cuadre: () => cuadre(arg ?? ""),
  "sesion-vencida": () => marcarSesion(false, "La sesión de Dropi Panamá (ECOMFIVE) expiró: hay que iniciar sesión en el navegador integrado."),
};
(acciones[orden ?? ""]?.() ?? Promise.reject(new Error("Uso: npx tsx scripts/dropi-diario.ts subida|cargar|cuadre <AAAA-MM-DD>|sesion-vencida"))).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
