// Carga todos los productos testeados de la pestaña «Panamá 🇵🇦» del sheet «COPIA de Control de Testing en Países» en
// Test productos (wms_productos_test) y crea cada producto en Producto (skus_maestros), vinculados (pedido de Hernán, 13 oct
// 2026). Reglas:
//   - Un test por fila del sheet; no se repite uno que ya esté (mismo nombre y fecha de test en Panamá).
//   - Un producto por nombre: «T2 …» va al mismo producto que el original. Si ya existe en Producto con ese nombre, se vincula.
//   - Una oferta «2X1», «3x1», «X2»… se arma como el Shampoo Excalvo: el simple (nombre sin la oferta) y el compuesto (nombre
//     completo, SKU del simple + «/X2») con 2× el simple. El test del 2x1 se vincula al compuesto.
//   - Estado en Producto: si algún test del producto es winner (o sigue en consulta, testeando…) → Test; si todos fallaron → Inactivo.
//   - Código de barras interno (EAN-13 «20…») a todos.
//
// Sin --aplicar solo informa (datos-privados/informe-tests-panama.txt). Uso: npx tsx scripts/importar-tests-panama.ts [--aplicar]

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { primeroLibre, sugerirSku } from "../src/lib/wms/sugerir-sku";

process.loadEnvFile(".env.local");
const aplicar = process.argv.includes("--aplicar");
const PAIS_ID_PANAMA = "d558eb6f-601c-4f1d-84f0-10b6c0c491da";
const SHEET = "https://docs.google.com/spreadsheets/d/10qofi8xkNY873JB126Hg-KvFoAlvd8rgXtjKu7M0_mQ/export?format=csv&gid=0";
const PRIMERA_FILA = 7; // la 6 son los encabezados
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\r") continue;
    else if (c === "\n") {
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

const ESTADO_MAPA: Record<string, string> = {
  Pendiente: "pendiente",
  Backlog: "backlog",
  Testeando: "testeando",
  Reserva: "reserva",
  Consulta: "consulta",
  Winner: "winner",
  "Enviado a Compras": "enviado_a_compras",
  Fallido: "fallido",
  Descartado: "descartado",
};
const FALLIDOS = new Set(["fallido", "descartado"]);
const TEST_NUMERO_MAPA: Record<string, string> = { "Test 1": "test_1", "Test 2": "test_2", "Test 3": "test_3" };

const texto = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};
const sinDefecto = (v: string | undefined, defecto: string) => {
  const t = texto(v);
  return t && t !== defecto ? t : null;
};
const numero = (v: string | undefined, quitar: RegExp) => {
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.replace(quitar, ""));
  return Number.isFinite(n) ? n : null;
};
const dinero = (v: string | undefined) => numero(v, /[$,\s]/g);
const pct = (v: string | undefined) => numero(v, /[%\s]/g);
const entero = (v: string | undefined) => {
  const n = numero(v, /[,\s]/g);
  return n === null ? null : Math.round(n);
};
const fecha = (v: string | undefined) => {
  const m = (texto(v) ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};
/** Para comparar nombres: minúsculas, sin acentos ni signos. */
const norm = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * La llave para reconocer el mismo producto aunque cambie el orden de las palabras o una medida («Excalvo Shampoo» =
 * «Shampoo Excalvo 200ml»): sus palabras, sin relleno, números, medidas ni «promoción/oferta», ordenadas.
 */
const RELLENO = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "para", "con", "sin", "en", "por", "a", "al", "un", "una", "x", "promocion", "oferta", "nuevo", "nueva"]);
const llave = (t: string) =>
  [...new Set(norm(t).split(" ").filter((w) => w && !RELLENO.has(w) && !/^\d/.test(w)))].sort().join(" ");

/** «T2 GEL…» → «GEL…» (el segundo test del mismo producto). */
const sinMarcaTest = (n: string) => n.replace(/^\s*T\s*[1-9]\s+/i, "").trim();

/**
 * La oferta del nombre: «2X1», «3x1» (N por 1) o «X2», «x2» sueltos → cuántas unidades lleva, y el nombre sin ella. «2 EN 1»,
 * «20PCS», «725 Piezas» no son ofertas (son el producto o su contenido).
 */
function oferta(nombre: string): { unidades: number; base: string } | null {
  const nx1 = /(^|[^0-9A-Za-z])([2-9])\s*[xX]\s*1(?![0-9])/;
  const xn = /(^|\s)[xX]\s?([2-9])(?=\s|$|[),.])/;
  // Regla de Hernán (13 oct 2026): «2 UNIDADES», «2UND», «Pack de 3»… con menos de 4 unidades es una oferta (compuesto); con 4
  // o más es el contenido del paquete (producto simple).
  const und = /(^|\s)(?:pack\s+de\s+([2-3])|([2-3])\s*(?:unidades|und|uds))(?=\s|$|[),.])/i;
  const u = nombre.match(und);
  if (u && !nombre.match(nx1) && !nombre.match(xn)) {
    const base = nombre.replace(und, " ").replace(/\s+/g, " ").replace(/[\s,;:\-–]+$/, "").trim();
    return { unidades: Number(u[2] ?? u[3]), base };
  }
  const m = nombre.match(nx1) ?? nombre.match(xn);
  if (!m) return null;
  const unidades = Number(m[2]);
  // Se quitan todas las apariciones (algunos nombres la repiten: «…2X1COCINA 2X1»).
  const base = nombre
    .replace(/([2-9])\s*[xX]\s*1(?![0-9])/g, " ")
    .replace(/(^|\s)[xX]\s?[2-9](?=\s|$|[),.])/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s,;:\-–]+$/, "")
    .trim();
  return { unidades, base };
}
/** Casos que podrían ser oferta pero no está claro («2 UNIDADES», «4 unidades», «pack»): van al informe. */
const dudosoOferta = (n: string) => /\b\d+\s*(unidades|uds|und|pack|paquetes?)\b/i.test(n) && !oferta(n);

interface Test {
  fila: number;
  nombre: string;
  registro: Record<string, unknown>;
  estado: string;
  base: string; // el producto simple
  unidades: number; // 1 = simple; 2, 3 = compuesto
}

function leerFila(f: string[], fila: number): Test | null {
  const nombre = texto(f[8]);
  if (!nombre) return null;
  const estadoTexto = texto(f[11]);
  const estado = (estadoTexto && ESTADO_MAPA[estadoTexto]) || "pendiente";
  const sinT = sinMarcaTest(nombre);
  const of = oferta(sinT);
  const testTexto = texto(f[13]);
  return {
    fila,
    nombre,
    estado,
    base: of ? of.base : sinT,
    unidades: of ? of.unidades : 1,
    registro: {
      nombre,
      fecha_creacion: fecha(f[0]),
      fuente: texto(f[1]),
      pagina_producto_url: texto(f[2]),
      video_url: texto(f[3]),
      categoria: texto(f[4]),
      angulo_venta: texto(f[5]),
      worldwide: sinDefecto(f[6], "Worldwide 🌎"),
      ad_library: sinDefecto(f[9], "AD LIBRARY"),
      fecha_test: fecha(f[10]),
      estado,
      clickup: (f[12] ?? "").trim().toUpperCase() === "TRUE",
      test_numero: testTexto ? (TEST_NUMERO_MAPA[testTexto] ?? null) : null,
      calculadora_url: texto(f[14]),
      metrica_oferta: dinero(f[15]),
      campana_url: texto(f[16]),
      metrica_cpm: dinero(f[17]),
      metrica_efectividad: pct(f[18]),
      metrica_hook_rate: pct(f[19]),
      metrica_ctr: pct(f[20]),
      metrica_cpa: dinero(f[21]),
      metrica_gasto: dinero(f[22]),
      metrica_compras: entero(f[23]),
      metrica_cvr: pct(f[24]),
    },
  };
}

async function main() {
  const filas = parseCSV(await (await fetch(SHEET)).text());
  const tests = filas.map((f, i) => (i + 1 >= PRIMERA_FILA ? leerFila(f, i + 1) : null)).filter((t): t is Test => t !== null);

  // Lo que ya está en el sistema.
  const { data: yaTests } = await supabase.from("wms_productos_test").select("id, nombre, fecha_test, sku_maestro_id").eq("pais_id", PAIS_ID_PANAMA);
  const { data: productos } = await supabase.from("skus_maestros").select("id, codigo, nombre, tipo, clase, padre_id");
  const { data: componentes } = await supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad");
  const codigos = new Set((productos ?? []).map((p) => String(p.codigo).toUpperCase()));
  const padres = new Set((productos ?? []).filter((p) => p.padre_id).map((p) => p.padre_id as string));
  const simplePorNombre = new Map<string, { id: string; codigo: string; nombre: string }>();
  const comboPorNombre = new Map<string, { id: string; codigo: string; nombre: string }>();
  const choques: string[] = [];
  for (const p of productos ?? []) {
    if (padres.has(p.id)) continue;
    // Si dos productos dan la misma llave, se queda el primero (el más antiguo) y se avisa en el informe.
    const mapa = p.tipo === "combo" ? comboPorNombre : simplePorNombre;
    const k = llave(p.nombre);
    if (mapa.has(k)) choques.push(`${mapa.get(k)!.codigo} y ${p.codigo} («${p.nombre}»)`);
    else mapa.set(k, { id: p.id, codigo: p.codigo, nombre: p.nombre });
  }
  // Un compuesto que ya existe por su simple y cantidad (Excalvo: 2× SHAMPOO/EXCALVO).
  const comboPorSimple = new Map<string, string>();
  const porCombo = new Map<string, { componente_id: string; cantidad: number }[]>();
  for (const c of componentes ?? []) porCombo.set(c.combo_id, [...(porCombo.get(c.combo_id) ?? []), c]);
  for (const [combo, cs] of porCombo) if (cs.length === 1) comboPorSimple.set(`${cs[0].componente_id}|${cs[0].cantidad}`, combo);
  const productoPorId = new Map((productos ?? []).map((p) => [p.id as string, p]));

  // Los tests que ya están: se descuentan por nombre + fecha (si una fila se repite, cuenta cada una).
  const yaPorClave = new Map<string, { id: string; sku: string | null }[]>();
  for (const t of yaTests ?? []) {
    const k = `${norm(t.nombre)}|${t.fecha_test ?? ""}`;
    yaPorClave.set(k, [...(yaPorClave.get(k) ?? []), { id: t.id, sku: t.sku_maestro_id }]);
  }
  const nuevos: Test[] = [];
  const existentesPorVincular: { test: Test; id: string }[] = [];
  const sinIgual: Test[] = [];
  for (const t of tests) {
    const lista = yaPorClave.get(`${norm(t.nombre)}|${t.registro.fecha_test ?? ""}`);
    const ya = lista?.shift();
    if (!ya) sinIgual.push(t);
    else if (!ya.sku) existentesPorVincular.push({ test: t, id: ya.id });
  }
  // Segunda vuelta: el mismo test con otro nombre en el sistema («Shampoo Excalvo» = «Excalvo Shampoo 2x1»): misma fecha y
  // mismas palabras del producto, sin la oferta.
  const renombrados: string[] = [];
  for (const t of sinIgual) {
    let hallado: { id: string; sku: string | null } | undefined;
    for (const [k, l] of yaPorClave) {
      const [nombreYa, fechaYa] = k.split("|");
      if (!l.length || fechaYa !== (t.registro.fecha_test ?? "")) continue;
      const of = oferta(sinMarcaTest(nombreYa));
      if (llave(of ? of.base : sinMarcaTest(nombreYa)) === llave(t.base)) {
        hallado = l.shift();
        renombrados.push(`fila ${t.fila} «${t.nombre}» = ya está como «${nombreYa}» (${fechaYa})`);
        break;
      }
    }
    if (!hallado) nuevos.push(t);
    else if (!hallado.sku) existentesPorVincular.push({ test: t, id: hallado.id });
  }

  // Los productos: un simple por nombre base y un compuesto por (base, unidades).
  interface Plan {
    clave: string;
    nombre: string;
    unidades: number;
    base: string;
    existente: { id: string; codigo: string; nombre: string } | null;
    codigo: string;
    tests: Test[];
  }
  const planes = new Map<string, Plan>();
  const conProducto = [...nuevos, ...existentesPorVincular.map((e) => e.test)];
  const planDe = (base: string, unidades: number, nombre: string): Plan => {
    const clave = `${llave(base)}|${unidades}`;
    let p = planes.get(clave);
    if (!p) {
      p = { clave, nombre, unidades, base, existente: null, codigo: "", tests: [] };
      planes.set(clave, p);
    }
    return p;
  };
  for (const t of conProducto) {
    const simple = planDe(t.base, 1, t.base);
    if (t.unidades === 1) simple.tests.push(t);
    else planDe(t.base, t.unidades, sinMarcaTest(t.nombre)).tests.push(t);
  }
  // Existentes y SKU de los nuevos (primero los simples: el compuesto toma el SKU de su simple + «/X2»).
  const ordenados = [...planes.values()].sort((a, b) => a.unidades - b.unidades);
  for (const p of ordenados) {
    if (p.unidades === 1) {
      p.existente = simplePorNombre.get(llave(p.base)) ?? null;
      if (p.existente) p.codigo = p.existente.codigo;
      else {
        p.codigo = primeroLibre(sugerirSku(p.base) || "PRODUCTO/TEST", (c) => codigos.has(c.toUpperCase()));
        codigos.add(p.codigo.toUpperCase());
      }
    } else {
      const simple = planes.get(`${llave(p.base)}|1`)!;
      const porNombre = comboPorNombre.get(llave(p.nombre));
      const porSimple = simple.existente ? comboPorSimple.get(`${simple.existente.id}|${p.unidades}`) : undefined;
      const existente = porNombre ?? (porSimple ? { id: porSimple, codigo: productoPorId.get(porSimple)!.codigo, nombre: productoPorId.get(porSimple)!.nombre } : null);
      p.existente = existente;
      if (existente) p.codigo = existente.codigo;
      else {
        p.codigo = primeroLibre(`${simple.codigo}/X${p.unidades}`, (c) => codigos.has(c.toUpperCase()));
        codigos.add(p.codigo.toUpperCase());
      }
    }
  }
  // Estado: Inactivo solo si todos sus tests (y los de sus compuestos, para el simple) fallaron.
  const clase = (p: Plan) => {
    const todos = p.unidades === 1 ? [...p.tests, ...[...planes.values()].filter((o) => o.unidades > 1 && llave(o.base) === llave(p.base)).flatMap((o) => o.tests)] : p.tests;
    return todos.length && todos.every((t) => FALLIDOS.has(t.estado)) ? "inactivo" : "test";
  };

  // ---------- Informe ----------
  const lista = [...planes.values()];
  const simplesNuevos = lista.filter((p) => p.unidades === 1 && !p.existente);
  const combosNuevos = lista.filter((p) => p.unidades > 1 && !p.existente);
  const existentes = lista.filter((p) => p.existente);
  const estados: Record<string, number> = {};
  for (const t of nuevos) estados[t.estado] = (estados[t.estado] ?? 0) + 1;
  const dudosos = tests.filter((t) => dudosoOferta(t.nombre));
  const variosTests = lista.filter((p) => p.tests.length > 1);
  const L: string[] = [];
  L.push(`INFORME DE PRUEBA — Test productos de Panamá (${new Date().toISOString().slice(0, 16)})`, "");
  L.push(`Filas con producto en el sheet: ${tests.length}`);
  L.push(`Ya están en Test productos: ${tests.length - nuevos.length} (de ellas, sin vincular a Producto: ${existentesPorVincular.length})`);
  L.push(`Tests NUEVOS a cargar: ${nuevos.length}  ${JSON.stringify(estados)}`, "");
  L.push(`Productos en Producto que intervienen: ${lista.length}`);
  L.push(`  - Simples nuevos: ${simplesNuevos.length} (Test: ${simplesNuevos.filter((p) => clase(p) === "test").length}, Inactivo: ${simplesNuevos.filter((p) => clase(p) === "inactivo").length})`);
  L.push(`  - Compuestos nuevos (2x1, 3x1…): ${combosNuevos.length} (Test: ${combosNuevos.filter((p) => clase(p) === "test").length}, Inactivo: ${combosNuevos.filter((p) => clase(p) === "inactivo").length})`);
  L.push(`  - Ya existen en Producto (solo se vinculan): ${existentes.length}`);
  L.push(`  - Códigos de barras internos a generar: ${simplesNuevos.length + combosNuevos.length}`);
  L.push(`  - Productos con más de un test (T2, repetidos o en 2x1 y solo): ${variosTests.length}`, "");
  L.push("== COMPUESTOS (oferta) ==");
  for (const p of lista.filter((x) => x.unidades > 1).sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    const s = planes.get(`${llave(p.base)}|1`)!;
    L.push(`${p.existente ? "[ya existe] " : ""}${p.codigo}  «${p.nombre}»  = ${p.unidades}× ${s.codigo} «${s.base}»${s.existente ? " (simple ya existe)" : ""}  · ${clase(p)}  · filas ${p.tests.map((t) => t.fila).join(", ")}`);
  }
  L.push("", "== YA EXISTEN EN PRODUCTO (se vinculan) ==");
  for (const p of existentes) L.push(`${p.codigo}  «${p.existente!.nombre}»  ← ${p.tests.length} test(s), filas ${p.tests.map((t) => t.fila).join(", ")}`);
  L.push("", "== VARIOS TESTS EN UN MISMO PRODUCTO ==");
  for (const p of variosTests) L.push(`${p.codigo}  «${p.nombre}»  ← ${p.tests.map((t) => `fila ${t.fila} «${t.nombre}» (${t.estado})`).join(" | ")}`);
  L.push("", "== PRODUCTOS QUE YA EXISTÍAN CON EL MISMO NOMBRE (se usa el primero) ==");
  for (const c of choques) L.push(c);
  L.push("", "== YA ESTÁN EN EL SISTEMA CON OTRO NOMBRE (no se duplican) ==");
  for (const r of renombrados) L.push(r);
  L.push("", "== TESTS QUE YA ESTÁN EN EL SISTEMA PERO NO SALEN EN EL SHEET (no se tocan) ==");
  for (const [k, l] of yaPorClave) for (const x of l) L.push(`${k}  (id ${x.id})`);
  L.push("", "== DUDOSOS (¿es oferta?) ==");
  for (const t of dudosos) L.push(`fila ${t.fila}  «${t.nombre}»  → se crea como producto simple`);
  L.push("", "== SIMPLES NUEVOS ==");
  for (const p of simplesNuevos.sort((a, b) => a.codigo.localeCompare(b.codigo))) L.push(`${p.codigo}  «${p.base}»  · ${clase(p)}  · ${p.tests.length ? `filas ${p.tests.map((t) => t.fila).join(", ")}` : "solo como componente"}`);
  writeFileSync("datos-privados/informe-tests-panama.txt", L.join("\n"), "utf8");
  console.log(L.slice(0, 14).join("\n"));
  console.log(`\nInforme completo: datos-privados/informe-tests-panama.txt`);

  if (!aplicar) return;
  // ---------- Aplicar ----------
  const idPorClave = new Map<string, string>();
  for (const p of ordenados) {
    if (p.existente) {
      idPorClave.set(p.clave, p.existente.id);
      continue;
    }
    const { data: barras, error: eb } = await supabase.rpc("wms_generar_codigo_barras");
    if (eb || !barras) throw new Error(`Sin código de barras para ${p.codigo}: ${eb?.message}`);
    const { data, error } = await supabase
      .from("skus_maestros")
      .insert({ codigo: p.codigo, nombre: p.unidades === 1 ? p.base : p.nombre, tipo: p.unidades === 1 ? "simple" : "combo", clase: clase(p), estado: "aprobado", codigo_barras: String(barras), codigo_barras_origen: "interno" })
      .select("id")
      .single();
    if (error) throw new Error(`No se creó ${p.codigo}: ${error.message}`);
    idPorClave.set(p.clave, data.id);
    if (p.unidades > 1) {
      const simpleId = idPorClave.get(`${llave(p.base)}|1`)!;
      const { error: ec } = await supabase.from("sku_maestro_componentes").insert({ combo_id: data.id, componente_id: simpleId, cantidad: p.unidades });
      if (ec) throw new Error(`Sin componente para ${p.codigo}: ${ec.message}`);
    }
  }
  const skuDe = (t: Test) => idPorClave.get(`${llave(t.base)}|${t.unidades}`)!;
  let cargados = 0;
  for (let i = 0; i < nuevos.length; i += 100) {
    const lote = nuevos.slice(i, i + 100).map((t) => ({ pais_id: PAIS_ID_PANAMA, ...t.registro, sku_maestro_id: skuDe(t) }));
    const { error } = await supabase.from("wms_productos_test").insert(lote);
    if (error) throw new Error(`Error cargando tests: ${error.message}`);
    cargados += lote.length;
  }
  let vinculados = 0;
  for (const e of existentesPorVincular) {
    const { error } = await supabase.from("wms_productos_test").update({ sku_maestro_id: skuDe(e.test) }).eq("id", e.id).is("sku_maestro_id", null);
    if (!error) vinculados++;
  }
  console.log(`\nAplicado: ${idPorClave.size - existentes.length} productos creados, ${cargados} tests cargados, ${vinculados} tests existentes vinculados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
