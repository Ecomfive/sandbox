// Vincula las compras históricas (las de ClickUp, sin productos) con su producto del sistema, comparando el NOMBRE y la
// FOTO, y le agrega la línea con las unidades compradas y el costo total de la orden, igual que «Productos» en la ficha.
//
// Antes: scripts/huellas-fotos-compras.ts deja en datos-privados/huellas-fotos.json la huella (dHash) de cada foto de producto y
// de las fotos de esas compras. Dos fotos con huellas a 6 bits o menos son la misma imagen (aunque cambie el tamaño).
//
//   npx tsx scripts/vincular-compras-productos.ts            → informe: qué vincularía, qué deja para revisar y por qué
//   npx tsx scripts/vincular-compras-productos.ts --aplicar  → agrega las líneas seguras
//
// Seguras: el nombre es el mismo (sin lote ni código), o se parece mucho y ningún otro producto se le acerca, o la foto es
// la misma que la del producto y el nombre no lo contradice. Si la foto apunta a otro producto, va a revisión. No toca un
// producto compuesto, uno con variantes (se compra por variante) ni uno en Test. Unidades = QTY Total de la compra. Costo
// total = SOLO el monto de la descripción («Monto total: $720» o «Total de orden: … = $2622.24»; decisión de Hernán, 7 oct
// 2026): sin él, o con varios montos distintos, la compra no se vincula. El lote no se toma del nombre: lo pone el sistema.
// Aplicado el 7 oct 2026: 232 compras.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const limpiar = (t: string) =>
  t
    .replace(/["“”]?\s*lote\s*#?\s*\d+[^"“”]*["“”]?/gi, " ")
    .replace(/\b(ECOM\d*|PA|MX|CR|VE|GT|NI|SV|COM\d*)-\d+\b/gi, " ")
    .replace(/\(\s*\)/g, " ");
const norm = (t: string) =>
  limpiar(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const STOP = new Set(["de", "para", "con", "y", "el", "la", "los", "las", "en", "del", "x", "pcs", "und", "unidades", "lote", "nuevo", "viejo"]);
const toks = (t: string) => new Set(norm(t).split(" ").filter((w) => w && !STOP.has(w)));
function parecido(a: string, b: string) {
  if (norm(a) === norm(b)) return 1.01;
  const A = toks(a);
  const B = toks(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return (2 * i) / (A.size + B.size);
}
const distancia = (a: string, b: string) => {
  const x = BigInt("0x" + a) ^ BigInt("0x" + b);
  return x.toString(2).split("").filter((b) => b === "1").length;
};
const MISMA_FOTO = 6;

/** «1,915.20», «1.915,20», «720» → número. */
function numeroDe(t: string): number | null {
  let x = t.trim().replace(/[.,]$/, "");
  const coma = x.lastIndexOf(",");
  const punto = x.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) x = coma > punto ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
  else if (coma >= 0) x = /,\d{3}$/.test(x) ? x.replace(/,/g, "") : x.replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/**
 * El costo total de la orden según su DESCRIPCIÓN (el bloque «INFORMACIÓN DE COMPRAS» de ClickUp): «Monto total: $720» o
 * «Total de orden: $1915.20 + $640 + $67.04 = $2622.24» (el resultado). Si la descripción trae varios montos distintos (varias
 * reposiciones en la misma tarea) o ninguno, no hay costo seguro: null.
 */
function montoDeDescripcion(desc: string | null): { monto: number | null; motivo?: string } {
  if (!desc) return { monto: null, motivo: "sin descripción" };
  const t = desc.replace(/\*/g, "");
  const montos = new Set<number>();
  for (const m of t.matchAll(/monto\s+total\s*:?\s*(?:usd)?\s*\$\s*([\d.,]+)/gi)) {
    const n = numeroDe(m[1]);
    if (n) montos.add(n);
  }
  for (const m of t.matchAll(/total\s+de\s+orden\s*:?[^\n]*?=\s*\$\s*([\d.,]+)/gi)) {
    const n = numeroDe(m[1]);
    if (n) montos.add(n);
  }
  if (montos.size === 0) return { monto: null, motivo: "la descripción no dice el monto total" };
  if (montos.size > 1) return { monto: null, motivo: `la descripción trae varios montos (${[...montos].map((n) => "$" + n).join(", ")})` };
  return { monto: [...montos][0] };
}
/** Compras que el criterio daría por seguras pero que se revisan a mano (otra presentación o el color solo por la foto). */
const A_REVISAR: Record<string, string> = {
  "OC-0159": "«Aceite de Batana» contra «Aceite de Batana y Romero»",
  "ECOM04-0003": "«Blood Sugar» contra «TOPLUX Blood Sugar» (dudoso)",
  "PA-00188": "«Truly Beauty»: solo la foto dice Soft Serve",
  "PA-00172": "«Set de Ejercicio»: solo la foto dice el color Azul",
};
const dinero = (n: number) => n.toLocaleString("es-PA", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function todas(tabla: string, columnas: string, filtro?: (q: any) => any): Promise<Json[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filas: Json[] = [];
  for (let i = 0; ; i += 1000) {
    let q = supabase.from(tabla).select(columnas).range(i, i + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw error;
    filas.push(...((data ?? []) as unknown as Json[]));
    if ((data ?? []).length < 1000) break;
  }
  return filas;
}

async function main() {
  const huellas: Record<string, string> = JSON.parse(readFileSync("datos-privados/huellas-fotos.json", "utf8"));
  const productos = await todas("skus_maestros", "id, codigo, nombre, tipo, clase, padre_id");
  const conVariantes = new Set(productos.filter((p) => p.padre_id).map((p) => p.padre_id));
  const fotosProducto = productos.filter((p) => huellas[`p:${p.id}`]).map((p) => ({ p, h: huellas[`p:${p.id}`] }));
  const fotosCompra = new Map<string, string[]>();
  for (const [clave, h] of Object.entries(huellas)) {
    if (!clave.startsWith("c:")) continue;
    const id = clave.split(":")[1];
    fotosCompra.set(id, [...(fotosCompra.get(id) ?? []), h]);
  }
  const compras = (await todas("wms_compras", "id, numero, codigo, nombre, tipo, pais_id, qty_total, monto_total, pagado_a_proveedor, descripcion, creado_en, wms_compra_items(count)", (q) => q.order("creado_en")))
    .filter((c) => c.tipo === "pais" && !(c.wms_compra_items?.[0]?.count > 0));

  const seguras: Json[] = [];
  const revisar: Json[] = [];
  const bloqueadas: Json[] = [];
  let sinPareja = 0;
  for (const c of compras) {
    const porNombre = productos.map((p) => ({ p, sc: parecido(c.nombre, p.nombre) })).sort((a, b) => b.sc - a.sc);
    const [n1, n2] = porNombre;
    let foto: { p: Json; d: number } | null = null;
    for (const h of fotosCompra.get(c.id) ?? []) for (const fp of fotosProducto) {
      const d = distancia(h, fp.h);
      if (d <= MISMA_FOTO && (!foto || d < foto.d)) foto = { p: fp.p, d };
    }
    let elegido: Json | null = null;
    let motivo = "";
    if (foto && (foto.p.id === n1.p.id || parecido(c.nombre, foto.p.nombre) >= 0.3)) {
      elegido = foto.p;
      motivo = foto.p.id === n1.p.id ? "nombre y foto" : "foto (nombre parecido)";
    } else if (foto && n1.sc >= 0.6) {
      revisar.push({ c, motivo: `la foto es de ${foto.p.codigo} · ${foto.p.nombre}, el nombre apunta a ${n1.p.codigo} · ${n1.p.nombre}` });
      continue;
    } else if (n1.sc > 1) {
      elegido = n1.p;
      motivo = "mismo nombre";
    } else if (n1.sc >= 0.8 && n1.sc - n2.sc >= 0.25) {
      elegido = n1.p;
      motivo = `nombre muy parecido (${n1.sc.toFixed(2)})`;
    } else if (n1.sc >= 0.6) {
      revisar.push({ c, motivo: `nombre parecido a ${n1.p.codigo} · ${n1.p.nombre} (${n1.sc.toFixed(2)})${n2.sc >= 0.5 ? ` y a ${n2.p.codigo} · ${n2.p.nombre} (${n2.sc.toFixed(2)})` : ""}` });
      continue;
    } else {
      sinPareja++;
      continue;
    }
    const traba =
      elegido.tipo === "combo" ? "es un compuesto" : conVariantes.has(elegido.id) ? "tiene variantes (va por variante)" : elegido.clase === "test" ? "está en Test" : !(Number(c.qty_total) > 0) || !Number.isInteger(Number(c.qty_total)) ? "la compra no tiene QTY Total" : null;
    const clave = c.codigo ?? `OC-${String(c.numero).padStart(4, "0")}`;
    if (A_REVISAR[clave]) {
      revisar.push({ c, motivo: `${A_REVISAR[clave]} → ${elegido.codigo} · ${elegido.nombre}` });
      continue;
    }
    if (traba) {
      bloqueadas.push({ c, p: elegido, motivo: traba });
      continue;
    }
    const { monto, motivo: sinMonto } = montoDeDescripcion(c.descripcion);
    if (monto === null) bloqueadas.push({ c, p: elegido, motivo: sinMonto });
    else seguras.push({ c, p: elegido, motivo, monto });
  }

  const linea = (c: Json) => `${c.codigo ?? `OC-${String(c.numero).padStart(4, "0")}`} · ${String(c.nombre).slice(0, 70)}`;
  const informe: string[] = [];
  informe.push(`Compras de país sin productos: ${compras.length}`);
  informe.push(`Se vinculan: ${seguras.length} · Para revisar: ${revisar.length} · Con traba: ${bloqueadas.length} · Sin producto parecido: ${sinPareja}`);
  const porMotivo: Record<string, number> = {};
  for (const s of seguras) porMotivo[s.motivo.replace(/\(.*\)/, "").trim()] = (porMotivo[s.motivo.replace(/\(.*\)/, "").trim()] ?? 0) + 1;
  informe.push(`Por motivo: ${JSON.stringify(porMotivo)}`);
  informe.push("\n== SE VINCULAN ==");
  for (const s of seguras) {
    const total = s.monto as number;
    informe.push(`${linea(s.c)}  →  ${s.p.codigo} · ${s.p.nombre}  [${s.motivo}] ${s.c.qty_total} u.${total ? ` · ${dinero(Number(total))}` : " · sin costo"}`);
  }
  informe.push("\n== PARA REVISAR ==");
  for (const r of revisar) informe.push(`${linea(r.c)}  —  ${r.motivo}`);
  informe.push("\n== CON TRABA ==");
  for (const b of bloqueadas) informe.push(`${linea(b.c)}  →  ${b.p.codigo} · ${b.p.nombre}  —  ${b.motivo}`);
  writeFileSync("datos-privados/vinculos-compras-informe.txt", informe.join("\n"));
  // Lo que se vincularía, para abrir en Excel.
  const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filasCsv = seguras.map((s) => {
    const total = s.monto as number;
    const q = Number(s.c.qty_total);
    return [linea(s.c).split(" · ")[0], s.c.nombre, s.p.codigo, s.p.nombre, q, total, (total / q).toFixed(4), s.motivo].map(csv).join(";");
  });
  writeFileSync("datos-privados/vinculos-compras-propuestos.csv", "﻿" + ["Compra;Nombre de la compra;SKU;Producto;Unidades;Costo total (descripción);Costo unitario;Motivo", ...filasCsv].join("\r\n"));
  console.log(informe.slice(0, 3).join("\n"));
  if (!aplicar) return console.log("\nInforme completo: datos-privados/vinculos-compras-informe.txt (no se escribió nada; para aplicar: --aplicar)");

  let hechas = 0;
  const ahora = Date.now();
  for (const [i, s] of seguras.entries()) {
    const cantidad = Number(s.c.qty_total);
    const total = s.monto as number;
    const costo = total !== null && total !== undefined && Number(total) > 0 ? Number((Number(total) / cantidad).toFixed(10)) : null;
    const { error } = await supabase.rpc("wms_agregar_item_compra", { p_compra: s.c.id, p_sku: s.p.id, p_cantidad: cantidad, p_costo: costo, p_lote: null, p_origen: "clickup", p_usuario: null });
    if (error) {
      console.error(`✗ ${linea(s.c)}: ${error.message}`);
      continue;
    }
    // Igual que la ficha: la QTY y el monto de la compra salen de sus líneas.
    const { data: lineas } = await supabase.from("wms_compra_items").select("cantidad_pedida, costo_unitario").eq("compra_id", s.c.id);
    const unidades = (lineas ?? []).reduce((t, l) => t + Number(l.cantidad_pedida), 0);
    const conCosto = (lineas ?? []).filter((l) => l.costo_unitario !== null);
    const monto = conCosto.reduce((t, l) => t + Math.round(Number(l.cantidad_pedida) * Number(l.costo_unitario) * 100) / 100, 0);
    await supabase
      .from("wms_compras")
      .update({ qty_total: unidades, ...(conCosto.length ? { monto_total: Math.round(monto * 100) / 100 } : {}), actualizado_en: new Date().toISOString() })
      .eq("id", s.c.id);
    await supabase.from("wms_compra_eventos").insert({
      compra_id: s.c.id,
      campo: "productoAgregado",
      valor_antes: null,
      valor_despues: `${s.p.codigo} · ${s.p.nombre} · ${cantidad.toLocaleString("es-PA")} u.${costo !== null ? ` · ${dinero(Math.round(cantidad * costo * 100) / 100)}` : ""}`,
      ocurrido_en: new Date(ahora + i).toISOString(),
      autor: `Vínculo automático (${s.motivo})`,
      origen: "sistema",
    });
    hechas++;
  }
  console.log(`\nLíneas agregadas: ${hechas} de ${seguras.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
