// Herramienta local con botones (sin terminal) para que Carmen pueda:
//   1. Iniciar sesión en Dropi (cuando expire),
//   2. Actualizar los pedidos de un país eligiendo el rango de fechas, y
//   3. Actualizar el saldo de wallet de Dropi de un país,
// sin tener que escribir comandos. Corre SOLO en esta computadora, porque
// Dropi bloquea cualquier acceso que no venga de un navegador real ya
// logueado (por eso todo esto usa Playwright con una ventana visible).
//
// Uso: doble clic en scripts/actualizar-pedidos.bat (o: npx tsx scripts/actualizar-pedidos-servidor.ts)

import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";

const PUERTO = 4321;

// Seguridad (auditoría del 13 oct 2026): solo escucha en este equipo (127.0.0.1), solo atiende si la dirección es
// localhost:4321 (una página de internet no puede alcanzarlo con DNS rebinding) y todo lo que ejecuta algo es un POST que
// lleva un código que cambia cada vez que se abre la herramienta (otra página no puede pulsar los botones por la persona).
const HOSTS_PERMITIDOS = new Set([`localhost:${PUERTO}`, `127.0.0.1:${PUERTO}`]);
const TOKEN = randomBytes(24).toString("hex");

function tokenValido(valor: string | null): boolean {
  if (!valor || valor.length !== TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(valor), Buffer.from(TOKEN));
}

function origenPermitido(req: http.IncomingMessage): boolean {
  const origen = req.headers.origin;
  if (!origen) return true;
  try {
    return HOSTS_PERMITIDOS.has(new URL(origen).host);
  } catch {
    return false;
  }
}

const campoToken = () => `<input type="hidden" name="token" value="${TOKEN}" />`;

function ejecutar(args: string[]): Promise<{ ok: boolean; salida: string }> {
  return new Promise((resolve) => {
    try {
      const proceso = spawn("npx", args, { shell: true });
      let salida = "";
      proceso.stdout.on("data", (d) => (salida += d.toString()));
      proceso.stderr.on("data", (d) => (salida += d.toString()));
      proceso.on("close", (code) => resolve({ ok: code === 0, salida }));
      proceso.on("error", (err) => resolve({ ok: false, salida: String(err) }));
    } catch (err) {
      resolve({ ok: false, salida: String(err) });
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ESTILOS = `
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #18181b; background: #f7f7f7; }
  h1 { font-size: 1.25rem; }
  fieldset { border: 1px solid #e3e3e3; border-radius: 8px; padding: 16px; margin-bottom: 20px; background: #fff; }
  legend { font-weight: 600; padding: 0 6px; }
  label { display: block; font-size: 0.85rem; color: #6b6b6b; margin-bottom: 4px; margin-top: 10px; }
  input, select { padding: 6px 10px; border: 1px solid #e3e3e3; border-radius: 6px; width: 100%; box-sizing: border-box; font-size: 0.9rem; }
  button { background: #e4e4e7; color: #27272a; border: none; padding: 10px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 14px; }
  button:hover { background: #d4d4d8; }
  .aviso { font-size: 0.8rem; color: #6b6b6b; }
  .resultado { background: #eeeeee; padding: 12px; border-radius: 8px; white-space: pre-wrap; font-size: 0.8rem; overflow-x: auto; }
`;

function paginaPrincipal(): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>Actualizar pedidos Dropi</title><style>${ESTILOS}</style></head>
<body>
  <h1>Actualizar pedidos Dropi</h1>
  <p class="aviso">Al hacer clic se abre una ventana de Edge — no la cierres hasta que la página diga "Listo".</p>

  <fieldset>
    <legend>1. Iniciar sesión en Dropi</legend>
    <p class="aviso">Solo hace falta la primera vez, o si la sesión ya expiró.</p>
    <form method="POST" action="/sesion">
      ${campoToken()}
      <label>País</label>
      <select name="pais">
        <option value="pa">Panamá</option>
        <option value="cr">Costa Rica</option>
      </select>
      <button type="submit">Iniciar sesión</button>
    </form>
  </fieldset>

  <fieldset>
    <legend>2. Actualizar pedidos</legend>
    <form method="POST" action="/actualizar">
      ${campoToken()}
      <label>País</label>
      <select name="pais">
        <option value="pa">Panamá</option>
        <option value="cr">Costa Rica</option>
      </select>
      <label>Desde</label>
      <input type="date" name="desde" required />
      <label>Hasta</label>
      <input type="date" name="hasta" required />
      <button type="submit">Actualizar pedidos</button>
    </form>
  </fieldset>

  <fieldset>
    <legend>3. Actualizar saldo de wallet</legend>
    <p class="aviso">Trae el historial de retiros y el saldo actual de wallet directo de Dropi — se ve en Retiros y wallet.</p>
    <form method="POST" action="/actualizar-saldo">
      ${campoToken()}
      <label>País</label>
      <select name="pais">
        <option value="pa">Panamá</option>
        <option value="cr">Costa Rica</option>
      </select>
      <button type="submit">Actualizar saldo de wallet</button>
    </form>
  </fieldset>
</body>
</html>`;
}

function paginaProcesando(titulo: string): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>${titulo}</title><style>${ESTILOS}</style></head>
<body>
  <h1>${titulo}</h1>
  <p>Esto puede tardar varios minutos. No cierres esta ventana ni la de Edge...</p>
`;
}

function cerrarPagina(resultado: string, ok: boolean): string {
  return `
  <p><strong>${ok ? "✅ Listo." : "❌ Hubo un error."}</strong></p>
  <div class="resultado">${escapeHtml(resultado)}</div>
  <p><a href="/">← Volver</a></p>
</body>
</html>`;
}

// spawn(..., { shell: true }) es necesario en Windows para poder ejecutar "npx",
// pero eso significa que el texto se interpreta como linea de comandos: solo se
// aceptan valores que calcen exactamente con estos formatos conocidos.
function paisValido(valor: string): valor is "cr" | "pa" {
  return valor === "cr" || valor === "pa";
}
function fechaValida(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

/** Lee el formulario de un POST y comprueba su código; si no vale, responde 403 y devuelve null. */
async function leerFormulario(req: http.IncomingMessage, res: http.ServerResponse): Promise<URLSearchParams | null> {
  let cuerpo = "";
  for await (const chunk of req) {
    cuerpo += chunk;
    if (cuerpo.length > 10_000) break;
  }
  const datos = new URLSearchParams(cuerpo);
  if (!origenPermitido(req) || !tokenValido(datos.get("token"))) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Solicitud no permitida. Vuelve a abrir http://localhost:" + PUERTO + " y usa los botones de la página.");
    return null;
  }
  return datos;
}

/** El enlace «Actualizar desde Dropi» de Retiros llega aquí: solo muestra el botón, no ejecuta nada al abrirse. */
function paginaConfirmarSaldo(pais: "cr" | "pa"): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>Actualizar retiros</title><style>${ESTILOS}</style></head>
<body>
  <h1>Actualizar retiros de ${pais === "pa" ? "Panamá" : "Costa Rica"}</h1>
  <form method="POST" action="/actualizar-saldo">
    ${campoToken()}
    <input type="hidden" name="pais" value="${pais}" />
    <button type="submit">Actualizar ahora</button>
  </form>
</body>
</html>`;
}

const servidor = http.createServer(async (req, res) => {
  if (!HOSTS_PERMITIDOS.has(req.headers.host ?? "")) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Abre http://localhost:" + PUERTO);
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(paginaPrincipal());
    return;
  }

  if (req.method === "POST" && req.url === "/sesion") {
    const datos = await leerFormulario(req, res);
    if (!datos) return;
    const pais = datos.get("pais") ?? "";

    if (!paisValido(pais)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("País inválido.");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.write(paginaProcesando("Iniciando sesión..."));
    const r = await ejecutar(["tsx", "scripts/dropi-guardar-sesion.ts", pais]);
    res.end(cerrarPagina(r.salida, r.ok));
    return;
  }

  if (req.method === "POST" && req.url === "/actualizar") {
    const datos = await leerFormulario(req, res);
    if (!datos) return;
    const pais = datos.get("pais") ?? "";
    const desde = datos.get("desde") ?? "";
    const hasta = datos.get("hasta") ?? "";

    if (!paisValido(pais) || !fechaValida(desde) || !fechaValida(hasta)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("País o fechas inválidas.");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.write(paginaProcesando(`Actualizando pedidos de ${pais.toUpperCase()} (${desde} a ${hasta})...`));

    const extraccion = await ejecutar(["tsx", "scripts/dropi-extraer-ordenes.ts", pais, desde, hasta]);
    let salida = extraccion.salida;
    let ok = extraccion.ok;

    if (extraccion.ok) {
      const archivo = `.dropi-downloads/ordenes-${pais}-${desde}_a_${hasta}.json`;
      const ingesta = await ejecutar(["tsx", "scripts/dropi-ingerir-ordenes.ts", pais, archivo]);
      salida += "\n\n" + ingesta.salida;
      ok = ingesta.ok;
    }

    res.end(cerrarPagina(salida, ok));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/actualizar-saldo-rapido")) {
    const url = new URL(req.url, `http://localhost:${PUERTO}`);
    const pais = url.searchParams.get("pais") ?? "";

    if (!paisValido(pais)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("País inválido.");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(paginaConfirmarSaldo(pais));
    return;
  }

  if (req.method === "POST" && req.url === "/actualizar-saldo") {
    const datos = await leerFormulario(req, res);
    if (!datos) return;
    const pais = datos.get("pais") ?? "";

    if (!paisValido(pais)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("País inválido.");
      return;
    }

    const hoy = new Date().toISOString().slice(0, 10);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.write(paginaProcesando(`Actualizando saldo de wallet de ${pais.toUpperCase()}...`));

    const extraccion = await ejecutar(["tsx", "scripts/dropi-extraer-retiros.ts", pais]);
    let salida = extraccion.salida;
    let ok = extraccion.ok;

    if (extraccion.ok) {
      const archivo = `.dropi-downloads/retiros-${pais}-${hoy}.json`;
      const ingesta = await ejecutar(["tsx", "scripts/dropi-ingerir-retiros.ts", pais, archivo]);
      salida += "\n\n" + ingesta.salida;
      ok = ingesta.ok;
    }

    res.end(cerrarPagina(salida, ok));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("No encontrado");
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`Abre http://localhost:${PUERTO} en tu navegador para actualizar pedidos.`);
});

// Esta herramienta la usa alguien sin conocimientos tecnicos y sin nadie
// cerca para reiniciarla: un error inesperado no debe tumbar el servidor.
process.on("uncaughtException", (err) => console.error("Error inesperado (el servidor sigue activo):", err));
process.on("unhandledRejection", (err) => console.error("Error inesperado (el servidor sigue activo):", err));
