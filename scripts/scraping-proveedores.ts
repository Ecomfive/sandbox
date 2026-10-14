// Scraping de proveedores (Fuente de datos, 14 oct 2026): recibe lo que `scripts/scraping-proveedores-navegador.js` leyó en
// la página de un proveedor de Dropi y lo guarda: productos, historial de precio y stock, desaparecidos, privados vinculados
// por nombre, las cifras del encabezado (órdenes, productos, dropshippers) y la búsqueda con su duración.
//
// Uso:
//   npx tsx scripts/scraping-proveedores.ts recibir           escucha en 127.0.0.1:4322 e imprime la dirección para el navegador
//   npx tsx scripts/scraping-proveedores.ts archivo <json>     guarda una lectura ya bajada (la misma forma que manda el navegador)
//   npx tsx scripts/scraping-proveedores.ts pendientes         lista los proveedores con una búsqueda pedida desde el sistema
//   npx tsx scripts/scraping-proveedores.ts lista              los proveedores activos (la búsqueda diaria de las 5:00 los recorre)
//   npx tsx scripts/scraping-proveedores.ts huellas            calcula las huellas de foto que falten (también lo hace cada búsqueda)
//
// Cada lectura recibida queda también en datos-privados/scraping/ (ignorada por git).

process.loadEnvFile(".env.local");
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { huellaFoto } from "../src/lib/wms/huella-foto";
import { comparar, mejorPareja, normalizarDropi, type Evento, type ProductoGuardado, type ProductoVisto } from "../src/lib/scraping/comparar";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PUERTO = 4322;
const TOKEN = randomBytes(24).toString("hex");
// Solo la página de Dropi (o este equipo) puede mandar datos, y además con el código de este arranque.
const ORIGENES = /^https:\/\/app\.dropi\.(mx|co|cr|pa|cl|ec|pe|gt|py|ar)$/;

interface Lectura {
  dropiId: number;
  pais: string;
  url: string;
  nombre: string | null;
  inicio: string;
  duracionMs: number;
  paginas: number[];
  metricas: { productos: number; ordenes: number; dropshippers: number } | null;
  productos: unknown[];
}

async function enTrozos<T>(filas: T[], n: number, f: (trozo: T[]) => Promise<void>) {
  for (let i = 0; i < filas.length; i += n) await f(filas.slice(i, i + n));
}

function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

async function guardarLectura(l: Lectura) {
  const t0 = Date.now();
  if (!Number.isInteger(l.dropiId) || !Array.isArray(l.productos)) throw new Error("Lectura sin proveedor o sin productos.");
  const pais = /^[a-z]{2}$/.test(l.pais) ? l.pais : "mx";

  // 1. El proveedor (si no se agregó desde el sistema, se crea con lo que trae la lectura).
  let encontrado = revisar(
    await supabase.from("scraping_proveedores").select("id, nombre").eq("dropi_id", l.dropiId).eq("pais", pais).maybeSingle(),
    "Proveedor",
  );
  if (!encontrado) {
    const url = `https://app.dropi.${pais}/dashboard/provider/${l.dropiId}/${encodeURIComponent(l.nombre ?? String(l.dropiId))}`;
    encontrado = revisar(
      await supabase.from("scraping_proveedores").insert({ nombre: l.nombre ?? `Proveedor ${l.dropiId}`, pais, dropi_url: url, dropi_id: l.dropiId }).select("id, nombre").single(),
      "Crear proveedor",
    );
  }
  const proveedor = encontrado as { id: string; nombre: string };

  // 2. La búsqueda: la que se pidió desde el sistema o una nueva.
  const pedida = revisar(
    await supabase.from("scraping_busquedas").select("id").eq("proveedor_id", proveedor.id).in("estado", ["pendiente", "corriendo"]).order("inicio", { ascending: false }).limit(1).maybeSingle(),
    "Búsqueda pedida",
  );
  const busquedaId: string = pedida
    ? pedida.id
    : (revisar(await supabase.from("scraping_busquedas").insert({ proveedor_id: proveedor.id, inicio: l.inicio, estado: "corriendo" }).select("id").single(), "Crear búsqueda") as { id: string }).id;
  await supabase.from("scraping_busquedas").update({ estado: "corriendo", inicio: l.inicio }).eq("id", busquedaId);

  try {
    // 3. Lo guardado y la comparación.
    const guardados: (ProductoGuardado & { vinculado_a: string | null; vinculo_seguro: boolean })[] = [];
    for (let desde = 0; ; desde += 1000) {
      const data = revisar(
        await supabase.from("scraping_productos").select("id, dropi_producto_id, nombre, privado, precio, stock, estado, vinculado_a, vinculo_seguro").eq("proveedor_id", proveedor.id).order("id").range(desde, desde + 999),
        "Productos guardados",
      ) as { id: string; dropi_producto_id: number; nombre: string; privado: boolean; precio: string | null; stock: number | null; estado: "activo" | "desaparecido"; vinculado_a: string | null; vinculo_seguro: boolean }[];
      guardados.push(
        ...data.map((g) => ({ id: g.id, dropiId: Number(g.dropi_producto_id), nombre: g.nombre, privado: g.privado, precio: g.precio === null ? null : Number(g.precio), stock: g.stock, estado: g.estado, vinculado_a: g.vinculado_a, vinculo_seguro: g.vinculo_seguro })),
      );
      if (data.length < 1000) break;
    }
    const vistos = l.productos.map(normalizarDropi).filter((v): v is ProductoVisto => v !== null);
    const r = comparar(guardados, vistos, proveedor.nombre);
    const ahora = new Date().toISOString();

    // 4. Todo lo visto hoy queda activo con su último precio y stock (los nuevos se crean).
    const idPorDropi = new Map(guardados.map((g) => [g.dropiId, g.id]));
    const unicos = new Map(vistos.map((v) => [v.dropiId, v]));
    await enTrozos([...unicos.values()], 500, async (trozo) => {
      const data = revisar(
        await supabase
          .from("scraping_productos")
          .upsert(
            trozo.map((v) => ({
              proveedor_id: proveedor.id,
              dropi_producto_id: v.dropiId,
              sku: v.sku,
              nombre: v.nombre,
              foto_url: v.foto,
              privado: v.privado,
              precio: v.precio,
              precio_sugerido: v.precioSugerido,
              stock: v.stock,
              categoria: v.categoria,
              creado_en_dropi: v.creadoEnDropi,
              estado: "activo",
              motivo_desaparicion: null,
              ultima_vez: ahora,
            })),
            { onConflict: "proveedor_id,dropi_producto_id" },
          )
          .select("id, dropi_producto_id"),
        "Guardar productos",
      ) as { id: string; dropi_producto_id: number }[];
      for (const f of data) idPorDropi.set(Number(f.dropi_producto_id), f.id);
    });

    // 5. Lo que ya no aparece.
    for (const motivo of ["agotado", "privatizado", "desconocido"] as const) {
      const ids = r.desaparecidos.filter((d) => d.motivo === motivo).map((d) => d.id);
      await enTrozos(ids, 300, async (trozo) => {
        revisar(await supabase.from("scraping_productos").update({ estado: "desaparecido", motivo_desaparicion: motivo }).in("id", trozo), "Desaparecidos");
      });
    }

    // 6. Historial: la primera vez de los nuevos, los cambios y los desaparecidos.
    const historial: (Evento & { producto_id: string; busqueda_id: string; fecha: string })[] = [];
    const fila = (productoId: string, e: Evento) => ({ ...e, producto_id: productoId, busqueda_id: busquedaId, fecha: ahora });
    for (const n of r.nuevos) {
      const id = idPorDropi.get(n.dropiId);
      if (id) historial.push(fila(id, { evento: "primera_vez", precio: n.precio, stock: n.stock, precio_antes: null, stock_antes: null, detalle: n.privado ? "Privado" : null }));
    }
    for (const c of r.vistos) for (const e of c.eventos) historial.push(fila(c.id, e));
    for (const d of r.desaparecidos) historial.push(fila(d.id, d.evento));

    // 7. Privados: su producto con foto por nombre (seguro se vincula solo; si no, queda como sugerencia).
    const conFoto = [...unicos.values()].filter((v) => !v.privado).map((v) => ({ id: idPorDropi.get(v.dropiId)!, nombre: v.nombre }));
    const antes = new Map(guardados.map((g) => [g.id, g]));
    let vinculados = 0;
    for (const v of unicos.values()) {
      if (!v.privado) continue;
      const id = idPorDropi.get(v.dropiId)!;
      const pareja = mejorPareja(v.nombre, conFoto, proveedor.nombre);
      const previo = antes.get(id);
      const nuevoA = pareja?.id ?? null;
      if (pareja?.seguro) vinculados++;
      if (previo && previo.vinculado_a === nuevoA && previo.vinculo_seguro === !!pareja?.seguro) continue;
      revisar(
        await supabase.from("scraping_productos").update({ vinculado_a: nuevoA, vinculo_parecido: pareja ? Math.round(pareja.parecido * 100) : null, vinculo_seguro: !!pareja?.seguro }).eq("id", id),
        "Vincular privado",
      );
      if (pareja?.seguro) {
        const con = conFoto.find((c) => c.id === pareja.id)?.nombre ?? "";
        historial.push(fila(id, { evento: "vinculado", precio: null, stock: null, precio_antes: null, stock_antes: null, detalle: `${con} (${Math.round(pareja.parecido * 100)} %)` }));
      }
    }
    await enTrozos(historial, 500, async (trozo) => {
      revisar(await supabase.from("scraping_producto_historial").insert(trozo), "Historial");
    });

    // 7b. La huella de las fotos que aún no la tienen (para cruzar con Producto y entre proveedores). Solo las nuevas: la
    // primera búsqueda de un proveedor tarda más.
    const huellas = await calcularHuellas(proveedor.id);

    // 8. Las cifras del encabezado de Dropi y el cierre de la búsqueda.
    if (l.metricas && [l.metricas.ordenes, l.metricas.productos, l.metricas.dropshippers].every((n) => Number.isInteger(n) && n >= 0)) {
      revisar(await supabase.from("scraping_proveedor_registros").insert({ proveedor_id: proveedor.id, ordenes: l.metricas.ordenes, productos: l.metricas.productos, dropshippers: l.metricas.dropshippers, origen: "dropi" }), "Cifras del proveedor");
    }
    const totalMs = l.duracionMs + (Date.now() - t0);
    const detalle = `${l.paginas.length} páginas de Dropi (${l.paginas.join(", ")}) en ${Math.round(l.duracionMs / 1000)} s; guardado en ${Math.round((Date.now() - t0) / 1000)} s. ${vinculados} privados vinculados. ${huellas} huellas de foto nuevas.`;
    revisar(
      await supabase
        .from("scraping_busquedas")
        .update({ estado: "lista", fin: new Date().toISOString(), productos_vistos: r.cuentas.vistos, nuevos: r.cuentas.nuevos, desaparecidos: r.cuentas.desaparecidos, cambios_precio: r.cuentas.cambiosPrecio, cambios_stock: r.cuentas.cambiosStock, privados: r.cuentas.privados, duracion_ms: totalMs, detalle })
        .eq("id", busquedaId),
      "Cerrar búsqueda",
    );
    return { proveedor: proveedor.nombre, ...r.cuentas, vinculados, historial: historial.length, duracionMs: totalMs, detalle };
  } catch (e) {
    await supabase.from("scraping_busquedas").update({ estado: "fallida", fin: new Date().toISOString(), detalle: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", busquedaId);
    throw e;
  }
}

/** Calcula la huella (dHash) de las fotos del proveedor que no la tienen, de 8 en 8. Devuelve cuántas guardó. */
async function calcularHuellas(proveedorId: string): Promise<number> {
  const { data, error } = await supabase.from("scraping_productos").select("id, foto_url").eq("proveedor_id", proveedorId).not("foto_url", "is", null).is("foto_huella", null).limit(2000);
  if (error) return 0; // Sin la migración 0106 no hay columna: se sigue sin huellas.
  let hechas = 0;
  const cola = [...(data ?? [])];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let f = cola.shift(); f; f = cola.shift()) {
        try {
          const r = await fetch(f.foto_url!, { signal: AbortSignal.timeout(15_000) });
          if (!r.ok) continue;
          const huella = await huellaFoto(new Uint8Array(await r.arrayBuffer()));
          if (huella && !(await supabase.from("scraping_productos").update({ foto_huella: huella }).eq("id", f.id)).error) hechas++;
        } catch {
          // Una foto que no baja se intenta en la próxima búsqueda.
        }
      }
    }),
  );
  return hechas;
}

function guardarCopia(l: Lectura) {
  mkdirSync("datos-privados/scraping", { recursive: true });
  const ruta = `datos-privados/scraping/${l.pais}-${l.dropiId}-${l.inicio.slice(0, 19).replace(/:/g, "")}.json`;
  writeFileSync(ruta, JSON.stringify(l));
  return ruta;
}

function tokenValido(valor: string): boolean {
  const a = Buffer.from(valor);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function recibir() {
  const servidor = http.createServer((req, res) => {
    const origen = req.headers.origin ?? "";
    const host = req.headers.host ?? "";
    if (host !== `127.0.0.1:${PUERTO}` && host !== `localhost:${PUERTO}`) return void res.writeHead(403).end();
    if (origen && ORIGENES.test(origen)) {
      res.setHeader("Access-Control-Allow-Origin", origen);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    } else if (origen && origen !== `http://127.0.0.1:${PUERTO}` && origen !== `http://localhost:${PUERTO}`) return void res.writeHead(403).end();
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    // El navegador no deja que una página de internet llame directo a este equipo: la pestaña de Dropi navega a este «puente»
    // (de 127.0.0.1) con la lectura comprimida en el fragmento (#) y el puente la manda aquí desde su propio origen.
    const puente = /^\/puente\/([0-9a-f]+)$/.exec(req.url ?? "");
    if (req.method === "GET" && puente && tokenValido(puente[1])) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return void res.end(`<!doctype html><meta charset="utf-8"><title>Puente scraping</title><p id="e">Esperando la lectura de Dropi…</p><script>
(async () => {
  const e = document.getElementById("e");
  const datos = location.hash.slice(1);
  if (!datos) return;
  history.replaceState(null, "", location.pathname);
  try {
    const b64 = datos.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const texto = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    e.textContent = "Guardando " + JSON.parse(texto).productos.length + " productos…";
    const r = await fetch("/recibir/${TOKEN}", { method: "POST", headers: { "Content-Type": "application/json" }, body: texto });
    const t = await r.text();
    e.textContent = (r.ok ? "Listo: " : "Error: ") + t;
    document.title = r.ok ? "Puente: listo" : "Puente: error";
  } catch (x) {
    e.textContent = "Error: " + x;
    document.title = "Puente: error";
  }
})();
</script>`);
    }
    const m = /^\/recibir\/([0-9a-f]+)$/.exec(req.url ?? "");
    if (req.method !== "POST" || !m || !tokenValido(m[1])) return void res.writeHead(404).end();
    let cuerpo = "";
    req.on("data", (d) => {
      cuerpo += d;
      if (cuerpo.length > 50_000_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const l = JSON.parse(cuerpo) as Lectura;
        const copia = guardarCopia(l);
        console.log(`Recibidos ${l.productos.length} productos del proveedor ${l.dropiId} (${copia}). Guardando…`);
        const resultado = await guardarLectura(l);
        console.log(resultado);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(resultado));
      } catch (e) {
        console.error(e);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end(String(e instanceof Error ? e.message : e));
      }
    });
  });
  servidor.listen(PUERTO, "127.0.0.1", () => {
    console.log(`Esperando lecturas. Puente: http://127.0.0.1:${PUERTO}/puente/${TOKEN}`);
  });
}

async function pendientes() {
  const data = revisar(
    await supabase.from("scraping_busquedas").select("id, inicio, scraping_proveedores(nombre, dropi_id, dropi_url)").eq("estado", "pendiente").order("inicio"),
    "Pendientes",
  );
  console.log(JSON.stringify(data, null, 2));
}

/** Los proveedores activos, para la búsqueda diaria: una línea por proveedor (id de Dropi, país y enlace). */
async function lista() {
  const data = revisar(await supabase.from("scraping_proveedores").select("nombre, dropi_id, pais, dropi_url").eq("activo", true).order("creado_en"), "Proveedores");
  for (const p of data ?? []) console.log(`${p.dropi_id}\t${p.pais}\t${p.dropi_url}\t${p.nombre}`);
}

const [modo, arg] = process.argv.slice(2);
if (modo === "recibir") recibir();
else if (modo === "lista") lista();
else if (modo === "huellas") lista().then(async () => {
  const { data } = await supabase.from("scraping_proveedores").select("id, nombre").eq("activo", true);
  for (const p of data ?? []) console.log(p.nombre, await calcularHuellas(p.id), "huellas nuevas");
});
else if (modo === "archivo" && arg) guardarLectura(JSON.parse(readFileSync(arg, "utf8")) as Lectura).then((r) => console.log(r));
else if (modo === "pendientes") pendientes();
else console.log("Uso: npx tsx scripts/scraping-proveedores.ts recibir | archivo <json> | pendientes | lista");
