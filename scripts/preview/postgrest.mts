// PostgREST + Auth + Storage falsos sobre PGlite, para la vista previa local (ver scripts/preview/README.md).
//
// No es PostgREST: traduce a SQL lo que `@supabase/supabase-js` pide en este código (select con columnas, alias,
// casts, rutas JSON y relaciones incrustadas — a uno, a muchos, `!inner`, por nombre de llave o de columna —, filtros
// eq/neq/gt/gte/lt/lte/like/ilike/is/in/cs/cd/ov/not/or/and también sobre una relación, order, limit/offset, count,
// single/maybeSingle, insert/upsert/update/delete con returning, y rpc). Auth responde siempre con la persona de la
// vista previa; Storage firma direcciones que no llevan a ningún archivo.
//
// Cada consulta que no supo responder queda en el registro (PREVIEW_LOG) con «FALSO» si es una limitación de este
// servidor y «SQL» si Postgres la rechazó (eso suele ser un error real del código o una migración que falta).
//
// Uso: npx tsx scripts/preview/postgrest.mts <carpeta-de-la-base> [puerto]
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from "node:http";
import { appendFileSync } from "node:fs";
import { cargarPGlite } from "./pglite.mjs";

export const USUARIO_PREVIEW = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "preview@ejemplo.test",
  nombre: "Vista previa",
};

type Fila = Record<string, unknown>;
interface DB {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Fila[] }>;
  exec: (sql: string) => Promise<unknown>;
}

interface Llave {
  nombre: string;
  hijo: string;
  colsHijo: string[];
  padre: string;
  colsPadre: string[];
}

interface Columna {
  nombre: string;
  tipo: string;
}

/** Supabase corta cada respuesta en 1 000 filas (max-rows de PostgREST); el falso hace lo mismo. */
const MAX_FILAS = Number(process.env.PREVIEW_MAX_ROWS ?? 1000);

class ErrorFalso extends Error {
  status = 400;
  code = "PGRST100";
}

const qi = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Parte por comas de primer nivel, respetando paréntesis y comillas dobles. */
function partir(s: string, sep = ","): string[] {
  const out: string[] = [];
  let nivel = 0;
  let comillas = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== "\\") comillas = !comillas;
    if (!comillas) {
      if (ch === "(" || ch === "{" || ch === "[") nivel++;
      if (ch === ")" || ch === "}" || ch === "]") nivel--;
    }
    if (ch === sep && nivel === 0 && !comillas) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.length) out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length);
}

const sinComillas = (x: string) => (/^"[\s\S]*"$/.test(x) ? x.slice(1, -1).replace(/\\(.)/g, "$1") : x);

// ---------- select ----------
type Item =
  | { tipo: "todo" }
  | { tipo: "col"; alias: string; col: string; ruta: string[]; flechas: string[]; cast?: string }
  | { tipo: "rel"; alias: string; nombre: string; pistas: string[]; inner: boolean; items: Item[]; spread: boolean };

function parsearSelect(s: string): Item[] {
  const limpio = s.replace(/\s+(?=([^"]*"[^"]*")*[^"]*$)/g, "");
  return partir(limpio || "*").map((t): Item => {
    if (t === "*") return { tipo: "todo" };
    const rel = t.match(/^(\.\.\.)?(?:([\w]+):)?([\w]+)((?:![\w]+)*)\(([\s\S]*)\)$/);
    if (rel) {
      const pistas = rel[4] ? rel[4].split("!").filter(Boolean) : [];
      const inner = pistas.includes("inner");
      return {
        tipo: "rel",
        spread: !!rel[1],
        alias: rel[2] ?? rel[3],
        nombre: rel[3],
        pistas: pistas.filter((p) => p !== "inner" && p !== "left"),
        inner,
        items: parsearSelect(rel[5]),
      };
    }
    const col = t.match(/^(?:([\w]+):)?("?[\w]+"?)((?:->>?'?[\w-]+'?)*)(?:::([\w ]+(?:\[\])?))?$/);
    if (!col) throw new ErrorFalso(`select no entendido: ${t}`);
    const partes = [...col[3].matchAll(/(->>?)'?([\w-]+)'?/g)];
    const nombreCol = sinComillas(col[2]);
    return {
      tipo: "col",
      alias: col[1] ?? (partes.length ? partes[partes.length - 1][2] : nombreCol),
      col: nombreCol,
      flechas: partes.map((p) => p[1]),
      ruta: partes.map((p) => p[2]),
      cast: col[4],
    };
  });
}

function exprRuta(alias: string, col: string, flechas: string[], ruta: string[]): string {
  let e = `${alias}.${qi(col)}`;
  flechas.forEach((f, i) => {
    const k = ruta[i];
    e += `${f}${/^\d+$/.test(k) ? k : `'${k.replace(/'/g, "''")}'`}`;
  });
  return e;
}

// ---------- servidor ----------
export async function crearServidor(db: DB, opciones: { log?: string } = {}) {
  const registrar = (linea: string) => {
    if (opciones.log) appendFileSync(opciones.log, `${new Date().toISOString()} ${linea}\n`);
  };

  let llaves: Llave[] = [];
  let columnas = new Map<string, Columna[]>();
  let pks = new Map<string, string[]>();
  let vistas = new Set<string>();

  async function leerCatalogo() {
    llaves = (
      await db.query(`select c.conname as nombre, h.relname as hijo, p.relname as padre,
        array(select a.attname::text from unnest(c.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o) as cols_hijo,
        array(select a.attname::text from unnest(c.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.o) as cols_padre
        from pg_constraint c join pg_class h on h.oid = c.conrelid join pg_class p on p.oid = c.confrelid
        join pg_namespace n on n.oid = h.relnamespace
        where c.contype = 'f' and n.nspname = 'public'`)
    ).rows.map((r) => ({
      nombre: r.nombre as string,
      hijo: r.hijo as string,
      padre: r.padre as string,
      colsHijo: r.cols_hijo as string[],
      colsPadre: r.cols_padre as string[],
    }));
    columnas = new Map();
    vistas = new Set();
    for (const r of (
      await db.query(`select c.relname as tabla, c.relkind::text as clase, a.attname as col, format_type(a.atttypid, a.atttypmod) as tipo
        from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
        where n.nspname = 'public' and c.relkind in ('r','v','m','p','f') and a.attnum > 0 and not a.attisdropped
        order by c.relname, a.attnum`)
    ).rows) {
      const t = r.tabla as string;
      if (r.clase === "v" || r.clase === "m") vistas.add(t);
      if (!columnas.has(t)) columnas.set(t, []);
      columnas.get(t)!.push({ nombre: r.col as string, tipo: r.tipo as string });
    }
    pks = new Map();
    for (const r of (
      await db.query(`select h.relname as tabla, array(select a.attname::text from unnest(c.conkey) with ordinality k(n, o)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o) as cols
        from pg_constraint c join pg_class h on h.oid = c.conrelid join pg_namespace n on n.oid = h.relnamespace
        where c.contype = 'p' and n.nspname = 'public'`)
    ).rows)
      pks.set(r.tabla as string, r.cols as string[]);
  }
  await leerCatalogo();

  const colsDe = (t: string) => {
    const c = columnas.get(t);
    if (!c) {
      const e = new ErrorFalso(`Could not find the table 'public.${t}' in the schema cache`);
      e.status = 404;
      e.code = "PGRST205";
      throw e;
    }
    return c;
  };
  const tipoDe = (t: string, col: string) => columnas.get(t)?.find((c) => c.nombre === col)?.tipo;

  interface Relacion {
    destino: string;
    aUno: boolean;
    /** pares [columna en el origen, columna en el destino] */
    pares: [string, string][];
  }

  function resolverRelacion(origen: string, nombre: string, pistas: string[]): Relacion {
    const conPista = (ls: Llave[]) =>
      pistas.length ? ls.filter((l) => pistas.some((p) => l.nombre === p || l.colsHijo[0] === p || l.colsPadre[0] === p)) : ls;
    // 1. Por nombre de tabla o vista.
    if (columnas.has(nombre)) {
      const aPadre = conPista(llaves.filter((l) => l.hijo === origen && l.padre === nombre));
      if (aPadre.length) return { destino: nombre, aUno: true, pares: aPadre[0].colsHijo.map((c, i) => [c, aPadre[0].colsPadre[i]]) };
      const aHijo = conPista(llaves.filter((l) => l.padre === origen && l.hijo === nombre));
      if (aHijo.length) return { destino: nombre, aUno: false, pares: aHijo[0].colsPadre.map((c, i) => [c, aHijo[0].colsHijo[i]]) };
      // Vistas: PostgREST sigue la columna de la vista hasta su tabla; aquí, por el nombre de la columna.
      const colsOrigen = new Set(colsDe(origen).map((c) => c.nombre));
      const colsDestino = new Set(colsDe(nombre).map((c) => c.nombre));
      if (vistas.has(origen) || vistas.has(nombre)) {
        const padreDestino = conPista(llaves.filter((l) => (l.padre === nombre || vistas.has(nombre)) && colsOrigen.has(l.colsHijo[0]) && (l.padre === nombre || colsDestino.has(l.colsPadre[0]))));
        const directa = padreDestino.find((l) => l.padre === nombre);
        if (directa) return { destino: nombre, aUno: true, pares: [[directa.colsHijo[0], directa.colsPadre[0]]] };
        const haciaOrigen = conPista(llaves.filter((l) => (l.padre === origen || vistas.has(origen)) && colsDestino.has(l.colsHijo[0]) && colsOrigen.has(l.colsPadre[0])));
        const d2 = haciaOrigen.find((l) => l.padre === origen) ?? haciaOrigen.find((l) => l.colsPadre[0] === "id" && colsOrigen.has("id"));
        if (d2) return { destino: nombre, aUno: false, pares: [[d2.colsPadre[0], d2.colsHijo[0]]] };
        // origen vista con columna <x>_id que en alguna tabla apunta a `nombre`
        const viaColumna = llaves.find((l) => l.padre === nombre && colsOrigen.has(l.colsHijo[0]));
        if (viaColumna) return { destino: nombre, aUno: true, pares: [[viaColumna.colsHijo[0], viaColumna.colsPadre[0]]] };
      }
    }
    // 2. Por nombre de la columna de la llave (`componente:componente_id(...)`) o de la llave misma.
    const porCol = llaves.filter((l) => l.hijo === origen && (l.colsHijo[0] === nombre || l.nombre === nombre));
    if (porCol.length) return { destino: porCol[0].padre, aUno: true, pares: porCol[0].colsHijo.map((c, i) => [c, porCol[0].colsPadre[i]]) };
    if (vistas.has(origen) && pistas.length) {
      const l = llaves.find((x) => x.padre === nombre && pistas.includes(x.colsHijo[0]));
      if (l) return { destino: nombre, aUno: true, pares: [[l.colsHijo[0], l.colsPadre[0]]] };
    }
    const e = new ErrorFalso(`Could not find a relationship between '${origen}' and '${nombre}' in the schema cache`);
    e.code = "PGRST200";
    throw e;
  }

  // ---------- filtros ----------
  interface Nodo {
    tabla: string;
    alias: string;
    items: Item[];
    conds: string[];
    orden: string[];
    limit?: number;
    offset?: number;
    hijos: Map<string, Nodo>;
  }

  function valorLista(v: string): string[] {
    const dentro = v.replace(/^\(/, "").replace(/\)$/, "");
    return partir(dentro).map(sinComillas);
  }

  function condicion(nodo: Nodo, colExpr: string, opTexto: string, valor: string, ps: unknown[]): string {
    let negar = false;
    let op = opTexto;
    if (op.startsWith("not.")) {
      negar = true;
      op = op.slice(4);
    }
    const m = colExpr.match(/^("?[\w]+"?)((?:->>?'?[\w-]+'?)*)$/);
    if (!m) throw new ErrorFalso(`columna de filtro no entendida: ${colExpr}`);
    const col = sinComillas(m[1]);
    const partes = [...m[2].matchAll(/(->>?)'?([\w-]+)'?/g)];
    const expr = exprRuta(nodo.alias, col, partes.map((p) => p[1]), partes.map((p) => p[2]));
    let tipo = partes.length ? (partes[partes.length - 1][1] === "->>" ? "text" : "jsonb") : tipoDe(nodo.tabla, col);
    if (!tipo) {
      const e = new ErrorFalso(`column ${nodo.tabla}.${col} does not exist`);
      e.code = "42703";
      throw e;
    }
    if (tipo === "json") tipo = "jsonb";
    const p = (v: unknown) => {
      ps.push(v);
      return `$${ps.length}`;
    };
    let sql: string;
    const comp: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
    const exprComp = tipo === "jsonb" && partes.length === 0 ? expr : expr;
    if (comp[op]) sql = `${exprComp} ${comp[op]} ${p(valor)}::${tipo === "jsonb" ? "jsonb" : tipo}`;
    else if (op === "like" || op === "ilike") sql = `${expr}::text ${op === "like" ? "like" : "ilike"} ${p(valor.replace(/\*/g, "%"))}`;
    else if (op === "is") {
      const v = valor.toLowerCase();
      sql = v === "null" ? `${expr} is null` : v === "not_null" ? `${expr} is not null` : v === "true" ? `${expr} is true` : v === "false" ? `${expr} is false` : `${expr} is unknown`;
    } else if (op === "in") {
      const lista = valorLista(valor);
      sql = lista.length ? `${expr} = any(${p(lista)}::${tipo.replace(/\[\]$/, "")}[])` : "false";
    } else if (op === "cs" || op === "cd" || op === "ov") {
      const sim = op === "cs" ? "@>" : op === "cd" ? "<@" : "&&";
      sql = `${expr} ${sim} ${p(valor)}::${tipo}`;
    } else if (/^(pl|ph|w)?fts/.test(op)) {
      const fn = op.startsWith("pl") ? "plainto_tsquery" : op.startsWith("ph") ? "phraseto_tsquery" : op.startsWith("w") ? "websearch_to_tsquery" : "to_tsquery";
      const v2 = valor.replace(/^\(\w+\)\./, "");
      sql = `to_tsvector(${expr}::text) @@ ${fn}(${p(v2)})`;
    } else throw new ErrorFalso(`operador no soportado: ${op}`);
    return negar ? `not (${sql})` : sql;
  }

  function grupoLogico(nodo: Nodo, texto: string, union: "and" | "or", ps: unknown[]): string {
    const dentro = texto.replace(/^\(/, "").replace(/\)$/, "");
    const partes = partir(dentro).map((t) => {
      const g = t.match(/^(not\.)?(and|or)\(([\s\S]*)\)$/);
      if (g) {
        const s = grupoLogico(nodo, `(${g[3]})`, g[2] as "and" | "or", ps);
        return g[1] ? `not (${s})` : s;
      }
      const c = t.match(/^([^.]+)\.((?:not\.)?\w+)\.([\s\S]*)$/);
      if (!c) throw new ErrorFalso(`filtro lógico no entendido: ${t}`);
      return condicion(nodo, c[1], c[2], sinComillas(c[3]), ps);
    });
    return partes.length ? `(${partes.join(` ${union} `)})` : "true";
  }

  function ordenar(nodo: Nodo, texto: string) {
    for (const o of partir(texto)) {
      const [c, ...mods] = o.split(".");
      const m = c.match(/^("?[\w]+"?)((?:->>?'?[\w-]+'?)*)$/);
      if (!m) throw new ErrorFalso(`orden no entendido: ${o}`);
      const partes = [...m[2].matchAll(/(->>?)'?([\w-]+)'?/g)];
      const e = exprRuta(nodo.alias, sinComillas(m[1]), partes.map((p) => p[1]), partes.map((p) => p[2]));
      const dir = mods.includes("desc") ? "desc" : "asc";
      const nulls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
      nodo.orden.push(`${e} ${dir}${nulls}`);
    }
  }

  let contadorAlias = 0;
  function armarNodo(tabla: string, items: Item[]): Nodo {
    const alias = `t${contadorAlias++}`;
    const nodo: Nodo = { tabla, alias, items, conds: [], orden: [], hijos: new Map() };
    for (const it of items) if (it.tipo === "rel") nodo.hijos.set(it.alias, armarNodo(resolverRelacion(tabla, it.nombre, it.pistas).destino, it.items));
    return nodo;
  }

  function nodoDe(raiz: Nodo, ruta: string[]): Nodo {
    let n = raiz;
    for (const r of ruta) {
      const h = n.hijos.get(r) ?? [...n.hijos.entries()].find(([, v]) => v.tabla === r)?.[1];
      if (!h) throw new ErrorFalso(`filtro sobre una relación que no está en el select: ${r}`);
      n = h;
    }
    return n;
  }

  const RESERVADAS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

  function aplicarParametros(raiz: Nodo, params: URLSearchParams, ps: unknown[]) {
    for (const [k, v] of params) {
      if (RESERVADAS.has(k)) {
        if (k === "order") ordenar(raiz, v);
        if (k === "limit") raiz.limit = Number(v);
        if (k === "offset") raiz.offset = Number(v);
        continue;
      }
      const partes = k.split(".");
      let ultimo = partes.pop()!;
      let negar = false;
      if (ultimo === "or" || ultimo === "and") {
        if (partes[partes.length - 1] === "not") {
          partes.pop();
          negar = true;
        }
      }
      const nodo = nodoDe(raiz, partes);
      if (ultimo === "order") ordenar(nodo, v);
      else if (ultimo === "limit") nodo.limit = Number(v);
      else if (ultimo === "offset") nodo.offset = Number(v);
      else if (ultimo === "or" || ultimo === "and") {
        const s = grupoLogico(nodo, v, ultimo, ps);
        nodo.conds.push(negar ? `not ${s}` : s);
      } else {
        const m = v.match(/^((?:not\.)?\w+)\.([\s\S]*)$/);
        if (!m) throw new ErrorFalso(`filtro no entendido: ${k}=${v}`);
        if (ultimo.startsWith('"')) ultimo = sinComillas(ultimo);
        nodo.conds.push(condicion(nodo, ultimo, m[1], m[2], ps));
      }
    }
  }

  /** Lista de columnas `expr AS alias` de un nodo, con sus relaciones como subconsultas JSON. */
  function columnasSql(nodo: Nodo, padre: Nodo | null): string[] {
    const out: string[] = [];
    for (const it of nodo.items) {
      if (it.tipo === "todo") for (const c of colsDe(nodo.tabla)) out.push(`${nodo.alias}.${qi(c.nombre)} as ${qi(c.nombre)}`);
      else if (it.tipo === "col") {
        if (!it.ruta.length && !tipoDe(nodo.tabla, it.col)) {
          const e = new ErrorFalso(`column ${nodo.tabla}.${it.col} does not exist`);
          e.code = "42703";
          throw e;
        }
        let e = exprRuta(nodo.alias, it.col, it.flechas, it.ruta);
        if (it.cast) e = `(${e})::${it.cast}`;
        out.push(`${e} as ${qi(it.alias)}`);
      } else {
        const hijo = nodo.hijos.get(it.alias)!;
        const rel = resolverRelacion(nodo.tabla, it.nombre, it.pistas);
        const union = rel.pares.map(([o, d]) => `${hijo.alias}.${qi(d)} = ${nodo.alias}.${qi(o)}`);
        const interno = subconsulta(hijo, union, nodo);
        const x = `x${hijo.alias}`;
        const sql = rel.aUno
          ? `(select row_to_json(${x}) from (${interno} limit 1) ${x})`
          : `(select coalesce(json_agg(row_to_json(${x})), '[]'::json) from (${interno}) ${x})`;
        if (it.spread && rel.aUno) {
          for (const sub of hijo.items) if (sub.tipo === "col") out.push(`(${sql})->${`'${sub.alias}'`} as ${qi(sub.alias)}`);
        } else out.push(`${sql} as ${qi(it.alias)}`);
        if (it.inner) nodo.conds.push(`exists (select 1 from ${qi(hijo.tabla)} ${hijo.alias} where ${[...union, ...hijo.conds].join(" and ")})`);
      }
    }
    void padre;
    return out;
  }

  function subconsulta(nodo: Nodo, union: string[], padre: Nodo): string {
    const cols = columnasSql(nodo, padre);
    const where = [...union, ...nodo.conds];
    return `select ${cols.join(", ") || "1 as _"} from ${qi(nodo.tabla)} ${nodo.alias}${where.length ? ` where ${where.join(" and ")}` : ""}${nodo.orden.length ? ` order by ${nodo.orden.join(", ")}` : ""}${nodo.limit != null ? ` limit ${nodo.limit}` : ""}${nodo.offset ? ` offset ${nodo.offset}` : ""}`;
  }

  const comoJson = (sql: string) => `select coalesce(json_agg(row_to_json(_x)), '[]'::json)::text as j from (${sql}) _x`;

  async function leer(tabla: string, params: URLSearchParams, conteo: boolean) {
    colsDe(tabla);
    const raiz = armarNodo(tabla, parsearSelect(params.get("select") ?? "*"));
    const ps: unknown[] = [];
    aplicarParametros(raiz, params, ps);
    const cols = columnasSql(raiz, null); // agrega condiciones de !inner
    const where = raiz.conds.length ? ` where ${raiz.conds.join(" and ")}` : "";
    // Como Supabase (max-rows): nunca más de MAX_FILAS por respuesta. Se pide una más para saber si se cortó.
    const pedido = raiz.limit ?? Infinity;
    const limite = Math.min(pedido, MAX_FILAS);
    const sql = `select ${cols.join(", ") || "1 as _"} from ${qi(tabla)} ${raiz.alias}${where}${raiz.orden.length ? ` order by ${raiz.orden.join(", ")}` : ""} limit ${limite + 1}${raiz.offset ? ` offset ${raiz.offset}` : ""}`;
    let filas = JSON.parse((await db.query(comoJson(sql), ps)).rows[0].j as string) as Fila[];
    if (filas.length > limite) {
      filas = filas.slice(0, limite);
      if (pedido > MAX_FILAS) registrar(`TOPE ${tabla}?${decodeURIComponent(params.toString()).slice(0, 400)} :: la respuesta se cortó en ${MAX_FILAS} filas (Supabase hace lo mismo): si el código no pagina, le faltan datos`);
    }
    let total: number | null = null;
    if (conteo) total = Number((await db.query(`select count(*)::int as n from ${qi(tabla)} ${raiz.alias}${where}`, ps)).rows[0].n);
    return { filas, total, offset: raiz.offset ?? 0 };
  }

  async function escribir(metodo: string, tabla: string, params: URLSearchParams, cuerpo: unknown, prefer: string) {
    const columnasTabla = colsDe(tabla);
    const tipos = new Map(columnasTabla.map((c) => [c.nombre, c.tipo]));
    const devolver = prefer.includes("return=representation");
    const items = parsearSelect(devolver ? (params.get("select") ?? "*") : "*");
    const ps: unknown[] = [];
    let mutacion: string;
    if (metodo === "POST") {
      const lista: Fila[] = Array.isArray(cuerpo) ? (cuerpo as Fila[]) : [cuerpo as Fila];
      if (!lista.length) return { filas: [], total: 0 };
      const conDefault = prefer.includes("missing=default");
      const conflicto = (params.get("on_conflict") ?? pks.get(tabla)?.join(",") ?? "id").split(",").map((x) => x.trim().replace(/"/g, ""));
      const merge = prefer.includes("resolution=merge-duplicates");
      const ignorar = prefer.includes("resolution=ignore-duplicates");
      // Agrupar por juego de columnas: con missing=default lo que falta toma su valor por defecto.
      const todas = [...new Set(lista.flatMap((f) => Object.keys(f)))];
      const grupos = new Map<string, Fila[]>();
      for (const f of lista) {
        const k = conDefault ? Object.keys(f).sort().join(",") : todas.join(",");
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k)!.push(f);
      }
      const partes: string[] = [];
      for (const [k, filas] of grupos) {
        const cols = k ? k.split(",") : [];
        for (const c of cols)
          if (!tipos.has(c)) {
            const e = new ErrorFalso(`Could not find the '${c}' column of '${tabla}' in the schema cache`);
            e.code = "PGRST204";
            throw e;
          }
        ps.push(JSON.stringify(filas));
        const n = ps.length;
        let s = cols.length
          ? `insert into ${qi(tabla)} (${cols.map(qi).join(", ")}) select ${cols.map(qi).join(", ")} from json_populate_recordset(null::${qi(tabla)}, $${n}::json)`
          : `insert into ${qi(tabla)} default values`;
        if (merge || ignorar) {
          const set = cols.filter((c) => !conflicto.includes(c)).map((c) => `${qi(c)} = excluded.${qi(c)}`);
          s += ` on conflict (${conflicto.map(qi).join(", ")}) do ${merge && set.length ? `update set ${set.join(", ")}` : "nothing"}`;
        }
        partes.push(`${s} returning *`);
      }
      // Un juego de columnas por sentencia; se devuelve la unión.
      const filas: Fila[] = [];
      for (let i = 0; i < partes.length; i++) {
        const nodo = armarNodo(tabla, items);
        const cols = columnasSql(nodo, null);
        const sqlP = partes[i].replace(/\$\d+::json/, "$1::json");
        const r = await db.query(`with m as (${sqlP}) ${comoJson(`select ${cols.join(", ")} from m ${nodo.alias}`)}`, [ps[i]]);
        filas.push(...(JSON.parse(r.rows[0].j as string) as Fila[]));
      }
      return { filas, total: filas.length };
    } else if (metodo === "PATCH") {
      const datos = cuerpo as Fila;
      const raiz = armarNodo(tabla, [{ tipo: "todo" }]);
      const cols = Object.keys(datos);
      for (const c of cols)
        if (!tipos.has(c)) {
          const e = new ErrorFalso(`Could not find the '${c}' column of '${tabla}' in the schema cache`);
          e.code = "PGRST204";
          throw e;
        }
      ps.push(JSON.stringify([datos]));
      const set = cols.map((c) => `${qi(c)} = _d.${qi(c)}`);
      aplicarParametros(raiz, params, ps);
      mutacion = `update ${qi(tabla)} ${raiz.alias} set ${set.join(", ")} from json_populate_recordset(null::${qi(tabla)}, $1::json) _d${raiz.conds.length ? ` where ${raiz.conds.join(" and ")}` : ""} returning ${raiz.alias}.*`;
      if (!cols.length) mutacion = `select * from ${qi(tabla)} where false`;
    } else {
      const raiz = armarNodo(tabla, [{ tipo: "todo" }]);
      aplicarParametros(raiz, params, ps);
      mutacion = `delete from ${qi(tabla)} ${raiz.alias}${raiz.conds.length ? ` where ${raiz.conds.join(" and ")}` : ""} returning ${raiz.alias}.*`;
    }
    const nodo = armarNodo(tabla, items);
    const cols = columnasSql(nodo, null);
    const r = await db.query(`with m as (${mutacion}) ${comoJson(`select ${cols.join(", ")} from m ${nodo.alias}`)}`, ps);
    const filas = JSON.parse(r.rows[0].j as string) as Fila[];
    return { filas, total: filas.length };
  }

  async function rpc(fn: string, args: Record<string, unknown>, params: URLSearchParams) {
    const defs = (
      await db.query(`select p.oid, p.proretset as conjunto, t.typtype::text as tipo_ret, format_type(p.prorettype, null) as ret,
        coalesce(p.proargnames, '{}') as nombres, coalesce(p.proargmodes::text[], '{}') as modos,
        array(select format_type(x, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) x) as tipos
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
        where n.nspname = 'public' and p.proname = $1`, [fn])
    ).rows as any[];
    if (!defs.length) {
      const e = new ErrorFalso(`Could not find the function public.${fn} in the schema cache`);
      e.status = 404;
      e.code = "PGRST202";
      throw e;
    }
    const claves = Object.keys(args);
    const def = defs.find((d) => claves.every((k) => d.nombres.includes(k))) ?? defs[0];
    const ps: unknown[] = [];
    const llamadas = claves.map((k) => {
      const i = def.nombres.indexOf(k);
      const tipo = def.tipos[i] as string;
      let v = args[k];
      if (v !== null && v !== undefined && typeof v === "object") {
        if (tipo.endsWith("[]") && Array.isArray(v))
          v = `{${v.map((x) => (x === null ? "NULL" : `"${String(typeof x === "object" ? JSON.stringify(x) : x).replace(/["\\]/g, "\\$&")}"`)).join(",")}}`;
        else v = JSON.stringify(v);
      } else if (v !== null && v !== undefined) v = String(v);
      ps.push(v ?? null);
      return `${qi(k)} => $${ps.length}::${tipo}`;
    });
    const llamada = `public.${qi(fn)}(${llamadas.join(", ")})`;
    const salida = def.modos.length ? def.nombres.filter((_: string, i: number) => def.modos[i] === "t" || def.modos[i] === "o") : [];
    if (def.conjunto || salida.length > 1 || def.tipo_ret === "c") {
      if (!def.conjunto && def.tipo_ret !== "c" && salida.length <= 1) {
        // escalar
      } else if (def.tipo_ret === "b" || def.tipo_ret === "d" || def.tipo_ret === "e") {
        if (def.conjunto) {
          const r = await db.query(`select coalesce(json_agg(_v), '[]'::json)::text as j from ${llamada} _v`, ps);
          return JSON.parse(r.rows[0].j as string);
        }
      } else {
        // Conjunto de filas: se le pueden aplicar select, filtros y orden.
        const tiposCols: Columna[] = salida.length
          ? salida.map((nombre: string) => ({ nombre, tipo: def.tipos[def.nombres.indexOf(nombre)] }))
          : (columnas.get(def.ret.replace(/^public\./, "").replace(/"/g, "")) ?? []);
        const pseudo = `__rpc_${fn}`;
        columnas.set(pseudo, tiposCols);
        const raiz = armarNodo(pseudo, parsearSelect(params.get("select") ?? "*"));
        aplicarParametros(raiz, params, ps);
        const cols = tiposCols.length ? columnasSql(raiz, null) : [`${raiz.alias}.*`];
        const sql = `select ${cols.join(", ")} from ${llamada} ${raiz.alias}${raiz.conds.length ? ` where ${raiz.conds.join(" and ")}` : ""}${raiz.orden.length ? ` order by ${raiz.orden.join(", ")}` : ""}${raiz.limit != null ? ` limit ${raiz.limit}` : ""}${raiz.offset ? ` offset ${raiz.offset}` : ""}`;
        const r = await db.query(comoJson(sql), ps);
        const filas = JSON.parse(r.rows[0].j as string);
        return def.conjunto ? filas : (filas[0] ?? null);
      }
    }
    const r = await db.query(`select to_json(${llamada})::text as j`, ps);
    const j = r.rows[0].j as string | null;
    return j == null ? null : JSON.parse(j);
  }

  // ---------- auth ----------
  const usuarioAuth = () => ({
    id: USUARIO_PREVIEW.id,
    aud: "authenticated",
    role: "authenticated",
    email: USUARIO_PREVIEW.email,
    app_metadata: { provider: "email" },
    user_metadata: { nombre: USUARIO_PREVIEW.nombre },
    created_at: "2026-01-01T00:00:00Z",
  });

  async function auth(ruta: string, metodo: string, res: http.ServerResponse) {
    const enviar = (s: number, b: unknown) => {
      res.writeHead(s, { "content-type": "application/json" });
      res.end(b === undefined ? "" : JSON.stringify(b));
    };
    if (ruta === "/auth/v1/user") return enviar(200, usuarioAuth());
    if (ruta.startsWith("/auth/v1/token"))
      return enviar(200, { access_token: tokenPreview(), refresh_token: "preview", token_type: "bearer", expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, user: usuarioAuth() });
    if (ruta === "/auth/v1/logout") return enviar(204, undefined);
    if (ruta.startsWith("/auth/v1/admin/users")) {
      const r = await db.query(`select id, email, created_at, last_sign_in_at, invited_at, email_confirmed_at from auth.users`);
      if (metodo === "GET" && ruta === "/auth/v1/admin/users") return enviar(200, { users: r.rows, aud: "authenticated" });
      return enviar(200, usuarioAuth());
    }
    return enviar(200, {});
  }

  // ---------- storage ----------
  function storage(ruta: string, metodo: string, res: http.ServerResponse, cuerpo: string) {
    const enviar = (s: number, b: unknown) => {
      res.writeHead(s, { "content-type": "application/json" });
      res.end(JSON.stringify(b));
    };
    const m = ruta.match(/^\/storage\/v1\/object\/(sign|upload\/sign|list|public|authenticated)?\/?([^/]+)\/?(.*)$/);
    if (ruta.startsWith("/storage/v1/object/list")) return enviar(200, []);
    if (ruta.startsWith("/storage/v1/object/upload/sign")) return enviar(200, { url: `/object/upload/sign/${m?.[2]}/${m?.[3]}?token=preview`, token: "preview" });
    if (ruta.startsWith("/storage/v1/object/sign")) {
      if (m?.[3]) return enviar(200, { signedURL: `/object/sign/${m[2]}/${m[3]}?token=preview` });
      const paths = (JSON.parse(cuerpo || "{}").paths ?? []) as string[];
      return enviar(200, paths.map((p) => ({ path: p, signedURL: `/object/sign/${m?.[2]}/${p}?token=preview`, error: null })));
    }
    if (metodo === "DELETE") return enviar(200, []);
    if (metodo === "POST" || metodo === "PUT") return enviar(200, { Key: ruta, Id: "preview" });
    if (ruta.startsWith("/storage/v1/bucket")) return enviar(200, []);
    return enviar(404, { statusCode: "404", error: "not_found", message: "Object not found" });
  }

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const metodo = req.method ?? "GET";
    let cuerpo = "";
    for await (const ch of req) cuerpo += ch;
    try {
      if (url.pathname.startsWith("/auth/")) return await auth(url.pathname, metodo, res);
      if (url.pathname.startsWith("/storage/")) return storage(url.pathname, metodo, res, cuerpo);
      if (url.pathname === "/__preview/recargar") {
        await leerCatalogo();
        res.writeHead(200);
        return res.end("ok");
      }
      if (!url.pathname.startsWith("/rest/v1/")) {
        res.writeHead(404);
        return res.end();
      }
      const recurso = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
      const prefer = String(req.headers.prefer ?? "");
      const accept = String(req.headers.accept ?? "");
      const conteo = /count=(exact|planned|estimated)/.test(prefer);
      const headers: Record<string, string> = { "content-type": "application/json" };
      let datos: unknown;
      if (recurso.startsWith("rpc/")) {
        let args: Record<string, unknown> = {};
        if (metodo === "GET" || metodo === "HEAD") {
          for (const [k, v] of [...url.searchParams]) {
            const c = (await db.query(`select 1 from pg_proc where proname = $1 and $2 = any(proargnames)`, [recurso.slice(4), k])).rows.length;
            if (c) {
              args[k] = v;
              url.searchParams.delete(k);
            }
          }
        } else args = cuerpo ? JSON.parse(cuerpo) : {};
        datos = await rpc(recurso.slice(4), args, url.searchParams);
        if (conteo) headers["content-range"] = `0-0/${Array.isArray(datos) ? datos.length : 1}`;
      } else if (metodo === "GET" || metodo === "HEAD") {
        const { filas, total, offset } = await leer(recurso, url.searchParams, conteo);
        datos = filas;
        headers["content-range"] = `${filas.length ? `${offset}-${offset + filas.length - 1}` : "*"}/${total ?? "*"}`;
      } else {
        const { filas, total } = await escribir(metodo, recurso, url.searchParams, cuerpo ? JSON.parse(cuerpo) : null, prefer);
        datos = prefer.includes("return=representation") ? filas : null;
        if (conteo) headers["content-range"] = `*/${total}`;
      }
      if (accept.includes("vnd.pgrst.object") && Array.isArray(datos)) {
        if (datos.length !== 1) {
          res.writeHead(406, headers);
          return res.end(JSON.stringify({ code: "PGRST116", details: `The result contains ${datos.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }));
        }
        datos = datos[0];
      }
      res.writeHead(datos === null && !recurso.startsWith("rpc/") ? (metodo === "POST" ? 201 : 204) : 200, headers);
      res.end(metodo === "HEAD" || (datos === null && !recurso.startsWith("rpc/")) ? "" : JSON.stringify(datos));
    } catch (e) {
      const err = e as { code?: string; message?: string; status?: number; detail?: string; hint?: string };
      const falso = e instanceof ErrorFalso;
      const status = err.status ?? (err.code === "23505" ? 409 : err.code === "42P01" || err.code === "42883" ? 404 : err.code === "P0001" ? 400 : 400);
      // Un PGRST205/PGRST202 (tabla o función inexistente) es la base, no el servidor falso.
      const clase = falso && !["PGRST205", "PGRST202", "42703", "PGRST204"].includes(err.code ?? "") ? "FALSO" : "SQL";
      registrar(`${clase} ${status} ${err.code ?? ""} ${metodo} ${decodeURIComponent(url.pathname + url.search).slice(0, 600)} :: ${String(err.message).slice(0, 400)}`);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: err.code ?? "XX000", message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null }));
    }
  });
  return { servidor, leerCatalogo };
}

/** Token con forma de JWT (sin firma válida: nadie la comprueba aquí). */
export function tokenPreview(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USUARIO_PREVIEW.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, email: USUARIO_PREVIEW.email })}.preview`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  const puerto = Number(process.argv[3] ?? 54321);
  if (!dir) {
    console.error("Uso: postgrest.mts <carpeta-de-la-base> [puerto]");
    process.exit(1);
  }
  const PGlite = await cargarPGlite();
  const db = new PGlite(dir);
  await db.exec("set timezone = 'UTC'");
  // PGlite atiende una consulta a la vez; las de Next llegan en paralelo y PGlite las encola solo.
  const { servidor } = await crearServidor(db as DB, { log: process.env.PREVIEW_LOG });
  servidor.listen(puerto, process.env.PREVIEW_HOST ?? "localhost", () => console.log(`PostgREST falso en http://localhost:${puerto} (base ${dir})`));
}
