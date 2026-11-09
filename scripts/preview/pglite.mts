// Carga PGlite sin que sea una dependencia del repo: PGLITE_DIR apunta a una copia instalada aparte
// (`npm i --prefix <carpeta> @electric-sql/pglite`); levantar.sh la instala en ~/.cache/preview-pglite si no hay ninguna. Ver scripts/preview/README.md.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CANDIDATOS = [
  process.env.PGLITE_DIR,
  join(process.cwd(), "node_modules/@electric-sql/pglite"),
  join(homedir(), ".cache/preview-pglite/node_modules/@electric-sql/pglite"),
].filter(Boolean) as string[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PGlite no es dependencia del repo: no hay tipos.
export async function cargarPGlite(): Promise<any> {
  for (const dir of CANDIDATOS) {
    const f = join(dir, "dist/index.js");
    if (existsSync(f)) return (await import(pathToFileURL(f).href)).PGlite;
  }
  throw new Error("No encuentro PGlite. Instálalo aparte y pon PGLITE_DIR=<carpeta>/node_modules/@electric-sql/pglite");
}
