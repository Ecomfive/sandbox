#!/usr/bin/env node
// Captura páginas de la vista previa con Playwright: escritorio claro (1440×900), escritorio oscuro y celular claro
// (390×844), página completa. Registra lo que salió mal (estado HTTP, errores de la consola, avisos de hidratación,
// excepciones de la página) en <salida>/informe.json y arma <salida>/indice.html con todas en miniatura.
//
// Uso: node scripts/preview/capturar.mjs [ruta…] [--salida=<carpeta>] [--variantes=claro,oscuro,celular]
//   Sin rutas captura todo el Portal AF4 (scripts/preview/rutas.mjs). Variables: PREVIEW_URL (http://127.0.0.1:3100),
//   NEXT_PUBLIC_SUPABASE_URL (http://localhost:54321), PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers).
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cookieSesion } from "./sesion.mjs";
import { RUTAS_PORTAL } from "./rutas.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/pw-browsers";
const { chromium } = await import("playwright");

const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:3100";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const args = process.argv.slice(2);
const opcion = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const SALIDA = opcion("salida", join(process.env.PREVIEW_DIR ?? ".preview", "capturas"));
const VARIANTES = opcion("variantes", "claro,oscuro,celular").split(",");
const rutasPedidas = args.filter((a) => !a.startsWith("--"));

const VARIANTE = {
  claro: { viewport: { width: 1440, height: 900 }, colorScheme: "light", tema: "light" },
  oscuro: { viewport: { width: 1440, height: 900 }, colorScheme: "dark", tema: "dark" },
  celular: { viewport: { width: 390, height: 844 }, colorScheme: "light", tema: "light", isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  // Cómo sale al imprimir (Informe mensual, recibo de deliverys): ancho de una hoja A4 a 96 ppp y la hoja de estilo «print».
  impresion: { viewport: { width: 794, height: 1123 }, colorScheme: "light", tema: "light", imprimir: true },
};

async function rest(ruta) {
  const r = await fetch(`${SUPA}/rest/v1/${ruta}`, { headers: { apikey: "preview", Authorization: "Bearer preview" } });
  return r.ok ? r.json() : [];
}

/** Completa :id (un presupuesto: lo crea con «Agregar» si no hay), :periodo y :cierre. */
async function resolverRutas(rutas, contexto) {
  const out = [];
  for (const r of rutas) {
    if (r.includes(":id") && r.startsWith("/presupuesto")) {
      let [p] = await rest("fin_presupuestos?select=id&order=creado_en.desc&limit=1");
      if (!p) p = await crearPresupuesto(contexto);
      if (p) out.push(r.replace(":id", p.id));
      else console.log("  ✗ no se pudo crear un presupuesto: se salta", r);
    } else if (r.includes(":periodo")) {
      const [m] = await rest("fin_movimientos?select=periodo&order=periodo.desc&limit=1&periodo=lt." + new Date().toISOString().slice(0, 7) + "-01");
      out.push(r.replace(":periodo", (m?.periodo ?? "2026-09-01").slice(0, 7)));
    } else if (r.includes(":paquete")) {
      const [v] = await rest("fin_paquetes_bancarios?select=id&order=creado_en.desc&limit=1");
      if (v) out.push(r.replace(":paquete", v.id));
      else console.log("  (sin versiones guardadas del paquete bancario: se salta)", r);
    } else if (r.includes(":cierre")) {
      const [c] = await rest("del_cierres?select=id&order=semana.desc&limit=1");
      if (c) out.push(r.replace(":cierre", c.id));
      else console.log("  (sin cierres de deliverys: se salta)", r);
    } else out.push(r);
  }
  return out;
}

async function crearPresupuesto(contexto) {
  const page = await contexto.newPage();
  try {
    await page.goto(`${BASE}/presupuesto?nuevo=1`, { waitUntil: "networkidle", timeout: 240_000 });
    await page.locator("#campo-nombre").fill(`Presupuesto vista previa`);
    await page.getByRole("button", { name: /Generar presupuesto/ }).click();
    await page.waitForURL(/\/presupuesto\/[0-9a-f-]{36}/, { timeout: 240_000 });
    const id = page.url().match(/presupuesto\/([0-9a-f-]{36})/)[1];
    console.log("  presupuesto creado con «Agregar»:", id);
    return { id };
  } catch (e) {
    console.log("  ✗ crear presupuesto:", e.message.split("\n")[0]);
    await page.screenshot({ path: join(SALIDA, "error-crear-presupuesto.png"), fullPage: true }).catch(() => {});
    return null;
  } finally {
    await page.close();
  }
}

const nombreDe = (ruta) => {
  const partes = ruta.split("?")[0].split("/").filter(Boolean);
  const seccion = partes[0] ?? "inicio";
  const resto = partes.slice(1).map((p) => (/^[0-9a-f-]{36}$/.test(p) ? "detalle" : /^\d{4}-\d{2}$/.test(p) ? "mes" : p));
  // Una ruta con parámetros («?vista=ttm») lleva sus valores en el nombre para no pisar la captura sin ellos.
  const consulta = [...new URLSearchParams(ruta.split("?")[1] ?? "").values()].map((v) => v.replace(/[^a-z0-9-]/gi, "")).filter(Boolean);
  return { seccion, pagina: [resto.join("-") || "inicio", ...consulta].join("-") };
};

mkdirSync(SALIDA, { recursive: true });
const archivoInforme = join(SALIDA, "informe.json");
const informe = existsSync(archivoInforme) ? JSON.parse(readFileSync(archivoInforme, "utf8")) : {};

/** El Chromium instalado puede ser de otra versión que la que espera este Playwright: se busca uno que exista. */
function ejecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!existsSync(dir)) return undefined;
  for (const d of readdirSync(dir).sort().reverse()) {
    for (const f of ["chrome-linux/headless_shell", "chrome-linux/chrome", "chrome-headless-shell-linux64/chrome-headless-shell"]) {
      if (existsSync(join(dir, d, f))) return join(dir, d, f);
    }
  }
  return undefined;
}
const lanzar = () =>
  chromium.launch({ args: ["--disable-dev-shm-usage"] }).catch(() => chromium.launch({ executablePath: ejecutable(), args: ["--disable-dev-shm-usage"] }));
let navegador = await lanzar();
const sesion = cookieSesion(SUPA);
const host = new URL(BASE).hostname;
const crearContexto = async (v) => {
  const { viewport, colorScheme, isMobile, hasTouch, deviceScaleFactor } = VARIANTE[v];
  const c = await navegador.newContext({ viewport, colorScheme, isMobile, hasTouch, deviceScaleFactor, locale: "es-PA", timezoneId: "America/Panama" });
  await c.addCookies([{ name: sesion.name, value: sesion.value, domain: host, path: "/", httpOnly: true, sameSite: "Lax" }]);
  await c.addInitScript((tema) => {
    try {
      localStorage.setItem("tema", tema);
    } catch {}
  }, VARIANTE[v].tema);
  return c;
};

const ctxPrep = await crearContexto("claro");
const rutas = await resolverRutas(rutasPedidas.length ? rutasPedidas : RUTAS_PORTAL, ctxPrep);
await ctxPrep.close();

/** Una captura; devuelve su fila del informe. Si el navegador se cae, lo vuelve a abrir y reintenta una vez. */
async function capturar(v, ruta, intento = 1) {
  const { seccion, pagina } = nombreDe(ruta);
  const dir = join(SALIDA, seccion);
  mkdirSync(dir, { recursive: true });
  const archivo = join(dir, `${pagina}-${v}.png`);
  const contexto = await crearContexto(v);
  const page = await contexto.newPage();
  const consola = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consola.push(`${m.type()}: ${m.text().slice(0, 500)}`);
  });
  page.on("pageerror", (e) => consola.push(`pageerror: ${String(e.message).slice(0, 500)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/_next/webpack-hmr")) consola.push(`http ${r.status()}: ${r.url().replace(BASE, "")}`);
  });
  const t0 = Date.now();
  let estado = 0;
  let error = null;
  let desborde = null;
  try {
    const resp = await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 300_000 });
    estado = resp?.status() ?? 0;
    if (VARIANTE[v].imprimir) await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(1200); // animaciones de las gráficas
    // Desborde horizontal: ninguna página debe ser más ancha que la ventana. Se anotan los elementos más externos que
    // se salen (los que se salen sin que su padre se salga), para saber qué arreglar.
    desborde = await page.evaluate(() => {
      const ancho = document.documentElement.clientWidth;
      const total = document.documentElement.scrollWidth;
      if (total <= ancho + 1) return null;
      const fuera = (el) => el.getBoundingClientRect().right > ancho + 1;
      // Lo que se sale dentro de una caja que recorta o se desplaza de lado (una tabla en su contenedor) no cuenta,
      // ni lo fijo (se estira con la página) ni lo que solo existe para lectores de pantalla.
      const recortado = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== "visible") return true;
        }
        return false;
      };
      const ignorar = (el) => {
        const s = getComputedStyle(el);
        return s.position === "fixed" || el.classList.contains("sr-only") || recortado(el);
      };
      const culpables = [];
      for (const el of document.querySelectorAll("body *")) {
        if (!fuera(el) || (el.parentElement && el.parentElement !== document.body && fuera(el.parentElement))) continue;
        if (ignorar(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        culpables.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} → ${Math.round(r.right)}px`);
        if (culpables.length >= 5) break;
      }
      return { ancho, total, culpables };
    });
    // Una captura de página completa deja lo fijo y lo pegajoso (menú lateral, fila de totales, encabezados) donde
    // estaba en la ventana de 900 px: se agranda la ventana al alto de la página para que se vea como al desplazarse.
    const alto = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const vp = VARIANTE[v].viewport;
    // En el celular no: con la página más ancha que la pantalla, el navegador aleja la vista y el alto se dispara.
    if (alto > vp.height && !VARIANTE[v].isMobile) {
      await page.setViewportSize({ width: vp.width, height: Math.min(alto, 30_000) });
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: archivo, fullPage: true, timeout: 120_000 });
  } catch (e) {
    error = e.message.split("\n")[0];
  }
  const titulo = await page.title().catch(() => "");
  await contexto.close().catch(() => {});
  if (error && /crash|closed/i.test(error) && intento === 1) {
    await navegador.close().catch(() => {});
    navegador = await lanzar();
    return capturar(v, ruta, 2);
  }
  const hidratacion = consola.filter((c) => /hydrat|did not match|server rendered|error #(418|423|425)/i.test(c));
  return { ruta, variante: v, seccion, pagina, archivo: `${seccion}/${pagina}-${v}.png`, estado, titulo, ms: Date.now() - t0, error, consola, hidratacion: hidratacion.length, desborde };
}

for (const v of VARIANTES) {
  for (const ruta of rutas) {
    const f = await capturar(v, ruta);
    informe[`${ruta} [${v}]`] = f;
    writeFileSync(archivoInforme, JSON.stringify(informe, null, 2));
    console.log(`${f.error ? "✗" : f.estado >= 400 ? "!" : "✓"} ${v.padEnd(7)} ${String(f.estado).padEnd(3)} ${ruta}${f.error ? ` — ${f.error}` : ""}${f.consola.length ? ` (${f.consola.length} avisos)` : ""}${f.desborde ? ` [desborda ${f.desborde.total}px]` : ""}`);
  }
}
await navegador.close();

// Índice con miniaturas.
const filas = Object.values(informe).sort((a, b) => a.ruta.localeCompare(b.ruta) || a.variante.localeCompare(b.variante));
const porRuta = new Map();
for (const f of filas) {
  if (!porRuta.has(f.ruta)) porRuta.set(f.ruta, []);
  porRuta.get(f.ruta).push(f);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Capturas Portal AF4</title><style>
body{font:14px system-ui,sans-serif;margin:24px;background:#f6f6f6;color:#111}h1{font-size:20px}
.ruta{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin:0 0 16px}
.ruta h2{font-size:15px;margin:0 0 8px;font-family:ui-monospace,monospace}.vars{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start}
figure{margin:0;width:220px}figure img{width:100%;max-height:420px;object-fit:cover;object-position:top;border:1px solid #ccc;border-radius:4px;background:#fff}
figcaption{font-size:12px;color:#555;margin-top:4px}.mal{color:#b00020}.aviso{font-size:12px;color:#7a5a00;margin:6px 0 0;white-space:pre-wrap;max-height:120px;overflow:auto}
</style></head><body><h1>Capturas del Portal AF4 · ${filas.length} capturas · ${new Date().toLocaleString("es-PA", { timeZone: "America/Panama" })}</h1>
${[...porRuta.entries()]
  .map(
    ([ruta, vs]) => `<section class="ruta"><h2>${esc(ruta)}</h2><div class="vars">${vs
      .map(
        (f) => `<figure><a href="${esc(f.archivo)}" target="_blank"><img loading="lazy" src="${esc(f.archivo)}" alt="${esc(`${ruta} ${f.variante}`)}"></a>
<figcaption class="${f.error || f.estado >= 400 ? "mal" : ""}">${esc(f.variante)} · ${f.estado || "—"} · ${(f.ms / 1000).toFixed(1)} s${f.consola.length ? ` · ${f.consola.length} avisos` : ""}${f.error ? `<br>${esc(f.error)}` : ""}</figcaption></figure>`,
      )
      .join("")}</div>${[...new Set(vs.flatMap((f) => f.consola))].length ? `<div class="aviso">${esc([...new Set(vs.flatMap((f) => f.consola))].join("\n"))}</div>` : ""}</section>`,
  )
  .join("\n")}
</body></html>`;
writeFileSync(join(SALIDA, "indice.html"), html);
console.log(`\n${filas.length} capturas · índice: ${join(SALIDA, "indice.html")}`);
