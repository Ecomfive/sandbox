// Una página o un layout (componentes de servidor) no puede llamar a una función ni leer un valor que exporta un módulo
// «use client»: en el servidor esa exportación es solo una referencia y la página se cae al renderizar («Attempted to
// call X() from the server but X is on the client»). Pasó con `usd4` en Costos de mercancía. Esta prueba lo busca en
// todo `src/app`: lo que viene de un módulo de cliente solo puede usarse como componente o pasarse como prop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const RAIZ = resolve(__dirname, "..");
const SERVIDOR = /^(page|layout|loading|not-found|template|default)\.tsx$|^route\.ts$/;

function archivos(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (SERVIDOR.test(n)) out.push(p);
  }
  return out;
}

function resolverImport(desde: string, mod: string): string | null {
  const base = mod.startsWith("@/") ? join(RAIZ, mod.slice(2)) : mod.startsWith(".") ? resolve(dirname(desde), mod) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

const esCliente = (f: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(readFileSync(f, "utf8"));

export function usosIndebidos(archivo: string): string[] {
  const src = readFileSync(archivo, "utf8");
  if (esCliente(archivo)) return [];
  const malos: string[] = [];
  for (const m of src.matchAll(/^import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm)) {
    const destino = resolverImport(archivo, m[2]);
    if (!destino || !esCliente(destino)) continue;
    const nombres = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("type "))
      .map((s) => s.split(/\s+as\s+/).pop()!.trim());
    const cuerpo = src.slice((m.index ?? 0) + m[0].length);
    for (const n of nombres) {
      if (/^[A-Z]/.test(n)) continue; // componente
      if (new RegExp(`(?<![\\w.])${n}\\s*(\\(|\\.|\\[)`).test(cuerpo)) malos.push(`${archivo.slice(RAIZ.length + 1)}: ${n} (de ${m[2]})`);
    }
  }
  return malos;
}

test("las páginas no llaman a funciones de un módulo de cliente", () => {
  const malos = archivos(join(RAIZ, "app")).flatMap(usosIndebidos);
  assert.deepEqual(malos, []);
});
