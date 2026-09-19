"use strict";
// Lanzador del hook de diseño de impeccable, igual en Windows, macOS y Linux.
//
// Por qué existe: el comando que trae impeccable está escrito para Bash. Si Claude Code lo lanza
// con PowerShell o cmd (o sin Git Bash) falla en silencio y nadie se entera. Este archivo se invoca
// con Node, que el proyecto ya necesita, y funciona igual en cualquier shell.
//
// Qué hace: lee el evento que envía Claude Code por stdin, ejecuta el lanzador de impeccable que
// corresponde al sistema y devuelve su salida y su código de salida tal cual. Además anota cada
// ejecución en .impeccable/hook-runs.log para poder comprobar que el hook corre de verdad.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const EN_WINDOWS = process.platform === "win32";
const LIMITE_LOG_BYTES = 256 * 1024;
const LINEAS_LOG_TRAS_RECORTE = 200;
const TIEMPO_MAXIMO_MS = 25000;

let entrada = "";
let ya = false;

process.stdin.setEncoding("utf8");
process.stdin.on("data", (trozo) => {
  entrada += trozo;
});
process.stdin.on("end", ejecutar);
process.stdin.on("error", ejecutar);
setTimeout(ejecutar, 4000).unref();

function leerEvento() {
  try {
    return JSON.parse(entrada);
  } catch {
    return {};
  }
}

function anotar(carpetaProyecto, registro) {
  try {
    const carpeta = path.join(carpetaProyecto, ".impeccable");
    fs.mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, "hook-runs.log");
    if (fs.existsSync(archivo) && fs.statSync(archivo).size > LIMITE_LOG_BYTES) {
      const lineas = fs.readFileSync(archivo, "utf8").split("\n").filter(Boolean);
      fs.writeFileSync(archivo, lineas.slice(-LINEAS_LOG_TRAS_RECORTE).join("\n") + "\n");
    }
    fs.appendFileSync(archivo, JSON.stringify(registro) + "\n");
  } catch {
    // El registro es un extra: si no se puede escribir, el hook sigue funcionando.
  }
}

function ejecutar() {
  if (ya) return;
  ya = true;

  const inicio = Date.now();
  const evento = leerEvento();
  const carpetaProyecto = process.env.CLAUDE_PROJECT_DIR || evento.cwd || process.cwd();
  const archivoEditado = evento.tool_input && (evento.tool_input.file_path || evento.tool_input.path);
  const base = {
    ts: new Date().toISOString(),
    evento: evento.hook_event_name || "desconocido",
    herramienta: evento.tool_name || null,
    archivo: archivoEditado ? path.basename(String(archivoEditado)) : null,
  };

  const lanzador = path.join(
    carpetaProyecto,
    ".claude",
    "skills",
    "impeccable",
    "scripts",
    EN_WINDOWS ? "impeccable.cmd" : "impeccable"
  );

  if (!fs.existsSync(lanzador)) {
    anotar(carpetaProyecto, { ...base, resultado: "lanzador_no_encontrado", ms: Date.now() - inicio });
    process.exitCode = 0;
    return;
  }

  const opciones = { input: entrada, encoding: "utf8", cwd: carpetaProyecto, env: process.env, timeout: TIEMPO_MAXIMO_MS };
  const resultado = EN_WINDOWS
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `""${lanzador}" hook"`], { ...opciones, windowsVerbatimArguments: true })
    : spawnSync("sh", [lanzador, "hook"], opciones);

  if (resultado.error) {
    anotar(carpetaProyecto, { ...base, resultado: "error", detalle: String(resultado.error.message || resultado.error), ms: Date.now() - inicio });
    process.exitCode = 0;
    return;
  }

  if (resultado.stdout) process.stdout.write(resultado.stdout);
  if (resultado.stderr) process.stderr.write(resultado.stderr);
  anotar(carpetaProyecto, {
    ...base,
    resultado: resultado.status === 0 ? "ok" : "salida_" + resultado.status,
    avisos: resultado.stdout ? resultado.stdout.length > 0 : false,
    ms: Date.now() - inicio,
  });
  process.exitCode = resultado.status === null ? 0 : resultado.status;
}
