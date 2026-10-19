// Carga en `categorias_productos` (migración 0113) la taxonomía estándar de productos de Shopify en español, tal como la
// publica Shopify (github.com/Shopify/product-taxonomy, archivo dist/es/categories.txt). Se puede repetir: actualiza por id.
//
//   npx tsx scripts/cargar-taxonomia-shopify.ts            → informe: cuántas categorías leería
//   npx tsx scripts/cargar-taxonomia-shopify.ts --aplicar  → las guarda

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { leerTaxonomia } from "../src/lib/categorias/taxonomia";

const URL_TAXONOMIA = "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/es/categories.txt";
const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const r = await fetch(URL_TAXONOMIA);
  if (!r.ok) throw new Error(`No se pudo bajar la taxonomía (${r.status})`);
  const categorias = leerTaxonomia(await r.text());
  console.log(`${categorias.length} categorías, ${categorias.filter((c) => c.nivel === 1).length} de primer nivel`);
  if (!aplicar) return;

  // De la raíz a las hojas, para que cada padre exista antes que sus hijos.
  const orden = [...categorias].sort((a, b) => a.nivel - b.nivel);
  for (let i = 0; i < orden.length; i += 500) {
    const { error } = await supabase.from("categorias_productos").upsert(orden.slice(i, i + 500));
    if (error) throw error;
  }
  console.log("Guardadas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
