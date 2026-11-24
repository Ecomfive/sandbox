// Cierre de las puertas del servidor. Cada función exportada de un archivo "use server" es un POST público que cualquiera
// puede llamar (el menú que esconde un botón no protege nada), y cada GET/POST/... de un `route.ts` también. Como el
// sistema usa la llave de servicio de Supabase, cada una tiene que revisar la sesión o los permisos ANTES de tocar datos.
//
// Esta prueba lee el código (con el analizador de TypeScript, sin ejecutarlo) y exige que cada puerta llame a una guardia
// reconocida (`GUARDIAS`): directamente, a través de una función del mismo archivo (a cualquier profundidad) o de una
// guardia derivada de la lista. Lo que no la llama tiene que estar en `cierre-acciones-permitidas.ts` con su motivo.
//
// Límites (es una red, no una prueba de corrección): basta con que la llamada aparezca en el cuerpo, aunque esté en una rama
// que no siempre corre o aunque se ignore lo que devuelve (`getUsuarioActual` devuelve null sin sesión: la acción tiene que
// revisarlo). No revisa que el módulo pedido sea el correcto. Las funciones de otros archivos solo cuentan si están en
// `GUARDIAS` (a propósito: `registrarAuditoria` o `getPaisActual` leen la sesión, pero no son una barrera). `x.auth.getUser()`
// solo cuenta si `x` es `createSessionClient()` (la declaración se busca por nombre, de la función hacia afuera). En un archivo
// "use server" todo valor exportado es una puerta; lo que no se puede revisar (desestructurado, reexportado) siempre falla.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { PUERTAS_PERMITIDAS } from "./cierre-acciones-permitidas";

const RAIZ = resolve(__dirname, "../../..");

type Clase = "sesion" | "derivada" | "cron" | "firma" | "enlace";

/**
 * Las guardias reconocidas, por módulo (ruta desde la raíz, sin extensión). Una llamada solo cuenta si el nombre se importa
 * de ese módulo. Las `derivada` son funciones de otro archivo que a su vez llaman a una guardia (la prueba lo comprueba).
 */
const GUARDIAS: { modulo: string; nombres: string[]; clase: Clase }[] = [
  {
    modulo: "src/lib/auth",
    nombres: ["requireModulo", "requireModuloEscritura", "requireAlgunModulo", "requirePestana", "requirePanel", "getUsuarioActual", "getUsuarioIdSesion", "getUsuarioSesion"],
    clase: "sesion",
  },
  // Sesión + módulo + país + tienda en una llamada: la guardia para lo nuevo (plan de seguridad, fase 4 · 18 nov 2026). Llama a
  // getUsuarioActual; `revisarAcceso` no cuenta (recibe el usuario de quien llama).
  { modulo: "src/lib/seguridad/exigir-acceso", nombres: ["exigirAcceso"], clase: "derivada" },
  // El CRM (Atención y Comercial): getUsuarioActual + el módulo de alguna de las dos áreas; devuelve null si no.
  { modulo: "src/app/(app)/crm-dropshippers/bandeja/datos-bandeja", nombres: ["usuarioBandeja"], clase: "derivada" },
  // Mandar algo por WhatsApp desde el CRM: usuarioBandeja(true) + lo afinado + la conversación del área de la persona.
  { modulo: "src/app/(app)/crm-dropshippers/bandeja/enviar-medio", nombres: ["chatParaEnviar"], clase: "derivada" },
  // El portal del proveedor (Shen Zhen): la cuenta sale de la sesión, nunca del navegador.
  { modulo: "src/lib/proveedor/sesion", nombres: ["cuentaProveedorActual", "requireProveedor"], clase: "derivada" },
  // El panel del repartidor (24 nov 2026): la cuenta y su nombre en Despacho ciudad salen de la sesión, nunca del navegador.
  { modulo: "src/lib/despacho/sesion-repartidor", nombres: ["cuentaRepartidorActual", "requireRepartidor"], clase: "derivada" },
  // Los crons de Vercel: `Authorization: Bearer <CRON_SECRET>` comparado en tiempo constante.
  { modulo: "src/lib/seguridad/cron", nombres: ["esPeticionDeCron"], clase: "cron" },
  { modulo: "src/lib/tareas/ruta", nombres: ["manejarCron"], clase: "derivada" },
  // Webhooks con firma HMAC (Meta: WhatsApp e Instagram; Shopify; Chatmaid) o con la palabra secreta de la dirección.
  { modulo: "src/lib/instagram/firma", nombres: ["firmaValida", "tokenDeVerificacionValido"], clase: "firma" },
  { modulo: "src/lib/ventas/shopify-webhook", nombres: ["firmaShopifyValida"], clase: "firma" },
  { modulo: "src/lib/ventas/chatmaid", nombres: ["firmaChatmaidValida"], clase: "firma" },
  // La extensión «Ecomfive · Uso»: llave firmada con el secreto del servidor que dice de quién es.
  { modulo: "src/lib/rendimiento/llave-uso", nombres: ["leerLlaveUso"], clase: "firma" },
  // La web app del mensajero: no hay sesión, la puerta es su código secreto (se busca en la base).
  { modulo: "src/lib/ventas/cargar-mensajero", nombres: ["resolverMensajero"], clase: "enlace" },
];

const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

interface Puerta {
  archivo: string;
  funcion: string;
  linea: number;
  tipo: "accion" | "ruta" | "accion-en-linea";
  /** El cuerpo; null si no se puede revisar aquí (se reexporta, se desestructura o no tiene valor): siempre falla. */
  nodo: ts.Node | null;
  /** Por qué no se pudo revisar (cuando `nodo` es null). */
  porQue?: string;
}

interface Analisis {
  archivo: string;
  esServidor: boolean;
  esRuta: boolean;
  puertas: Puerta[];
  locales: Map<string, ts.Node>;
  /** Nombre local → nombre importado y módulo. */
  importados: Map<string, { nombre: string; modulo: string }>;
  /** `import * as x from "..."`: x → módulo. */
  espacios: Map<string, string>;
}

/** `@/lib/auth`, `../auth` o `./auth.ts` → `src/lib/auth`. Los paquetes (`next/cache`) quedan tal cual. */
function moduloDe(archivo: string, especificador: string): string {
  let ruta: string;
  if (especificador.startsWith("@/")) ruta = `src/${especificador.slice(2)}`;
  else if (especificador.startsWith(".")) ruta = posix.normalize(posix.join(posix.dirname(archivo), especificador));
  else return especificador;
  return ruta.replace(/\.(tsx?|jsx?)$/, "").replace(/\/index$/, "");
}

const exportado = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const porDefecto = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
/** Quita lo que no cambia el valor: `(x)`, `x as T`, `x satisfies T`, `x!`, `<T>x`. */
function desenvolver(n: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n)) n = n.expression;
  return n;
}

/** Los nombres que declara un patrón desestructurado (`{ GET, POST: p, ...resto }`, `[a, b]`). */
function nombresDe(patron: ts.BindingName): string[] {
  if (ts.isIdentifier(patron)) return [patron.text];
  return patron.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : nombresDe(e.name)));
}

/** ¿Las primeras sentencias (el prólogo) traen la directiva dada? */
function tieneDirectiva(sentencias: ts.NodeArray<ts.Statement>, directiva: string): boolean {
  for (const s of sentencias) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
    if (s.expression.text === directiva) return true;
  }
  return false;
}

function analizar(archivo: string, texto: string): Analisis {
  const fuente = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const esServidor = tieneDirectiva(fuente.statements, "use server");
  const esRuta = /(^|\/)route\.tsx?$/.test(archivo);
  const linea = (n: ts.Node) => fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1;
  const a: Analisis = { archivo, esServidor, esRuta, puertas: [], locales: new Map(), importados: new Map(), espacios: new Map() };

  // Lo que se declara arriba del archivo (funciones y constantes) y lo que se importa.
  for (const s of fuente.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) a.locales.set(s.name.text, s);
    if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) a.locales.set(d.name.text, d.initializer);
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.importClause && !s.importClause.isTypeOnly) {
      const modulo = moduloDe(archivo, s.moduleSpecifier.text);
      const enlaces = s.importClause.namedBindings;
      if (enlaces && ts.isNamespaceImport(enlaces)) a.espacios.set(enlaces.name.text, modulo);
      if (enlaces && ts.isNamedImports(enlaces))
        for (const e of enlaces.elements) if (!e.isTypeOnly) a.importados.set(e.name.text, { nombre: (e.propertyName ?? e.name).text, modulo });
    }
  }

  const cuenta = (nombre: string) => (esRuta && !esServidor ? METODOS.has(nombre) : esServidor);
  const tipo = esServidor ? "accion" : "ruta";
  const agregar = (funcion: string, nodo: ts.Node | null, donde: ts.Node, porQue?: string, siempre = false) => {
    if (siempre || cuenta(funcion)) a.puertas.push({ archivo, funcion, linea: linea(donde), tipo, nodo, ...(nodo ? {} : { porQue }) });
  };
  /** El valor exportado: una función, una llamada (`cache(async () => …)`) o un nombre local (se sigue a su declaración). */
  const valor = (e: ts.Expression): ts.Node | null => {
    const d = desenvolver(e);
    return ts.isIdentifier(d) ? (a.locales.get(d.text) ?? null) : d;
  };

  if (esServidor || esRuta) {
    for (const s of fuente.statements) {
      if (ts.isFunctionDeclaration(s) && exportado(s)) agregar(porDefecto(s) ? "default" : (s.name?.text ?? "default"), s, s);
      // En un archivo "use server" Next solo admite funciones async exportadas: todo valor exportado es una puerta, y lo que la
      // prueba no entiende (un objeto, `handlers.x`) falla en vez de pasarse por alto.
      if (ts.isVariableStatement(s) && exportado(s))
        for (const d of s.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) {
            // `export const { GET, POST } = handlers`: no se puede saber qué función es cada una.
            const nombres = nombresDe(d.name);
            agregar(nombres.join(", ") || "(desestructurada)", null, d, "desestructurada: no se puede revisar", true);
          } else if (!d.initializer) agregar(d.name.text, null, d, "sin valor: no se puede revisar");
          else agregar(d.name.text, valor(d.initializer), d, "no se encontró la función");
        }
      if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
        if (!s.exportClause) agregar("*", null, s, "reexportada: no se puede revisar", true); // export * from "..."
        else if (ts.isNamedExports(s.exportClause))
          for (const e of s.exportClause.elements) {
            if (e.isTypeOnly) continue;
            const local = (e.propertyName ?? e.name).text;
            agregar(e.name.text, s.moduleSpecifier ? null : (a.locales.get(local) ?? null), e, s.moduleSpecifier ? "reexportada: no se puede revisar" : "no se encontró la función");
          }
        else agregar(s.exportClause.name.text, null, s, "reexportada: no se puede revisar", true); // export * as x from "..."
      }
      if (ts.isExportAssignment(s)) agregar("default", valor(s.expression), s, "no se encontró la función");
    }
  }

  // Acciones dentro de otro archivo: una función cuyo cuerpo empieza con "use server" (en un archivo que no lo es entero).
  if (!esServidor) {
    const visitar = (n: ts.Node): void => {
      if (ts.isFunctionLike(n) && "body" in n && n.body && ts.isBlock(n.body) && tieneDirectiva(n.body.statements, "use server")) {
        const nombre = "name" in n && n.name && ts.isIdentifier(n.name) ? n.name.text : ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) ? n.parent.name.text : `(línea ${linea(n)})`;
        a.puertas.push({ archivo, funcion: nombre, linea: linea(n), tipo: "accion-en-linea", nodo: n });
      }
      ts.forEachChild(n, visitar);
    };
    visitar(fuente);
  }
  return a;
}

const CLAVES_GUARDIA: ReadonlyMap<string, Clase> = new Map(GUARDIAS.flatMap((g) => g.nombres.map((n): [string, Clase] => [`${g.modulo}#${n}`, g.clase])));

const CLIENTE_DE_SESION = { modulo: "src/lib/supabase/server", nombre: "createSessionClient" };

/** ¿La expresión es `createSessionClient()` (con o sin `await`), importada de `@/lib/supabase/server`? */
function llamaClienteDeSesion(a: Analisis, e: ts.Expression): boolean {
  let d = desenvolver(e);
  if (ts.isAwaitExpression(d)) d = desenvolver(d.expression);
  if (!ts.isCallExpression(d) || !ts.isIdentifier(d.expression)) return false;
  const imp = a.importados.get(d.expression.text);
  return imp?.modulo === CLIENTE_DE_SESION.modulo && imp.nombre === CLIENTE_DE_SESION.nombre;
}

/**
 * ¿El objeto de `x.auth.getUser()` es el cliente de la sesión? Directo (`(await createSessionClient()).auth`) o una variable
 * declarada con él: se busca la declaración más cercana con ese nombre, de la función hacia afuera (como el alcance léxico).
 */
function esClienteDeSesion(a: Analisis, objeto: ts.Expression): boolean {
  const o = desenvolver(objeto);
  if (!ts.isIdentifier(o)) return llamaClienteDeSesion(a, o);
  for (let ambito: ts.Node | undefined = o.parent; ambito; ambito = ambito.parent) {
    if (!ts.isFunctionLike(ambito) && !ts.isSourceFile(ambito)) continue;
    let decl: ts.VariableDeclaration | undefined;
    const buscar = (n: ts.Node): void => {
      if (decl) return;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === o.text) decl = n;
      // Una función anidada es otro alcance: lo que declara ahí no se ve desde afuera.
      else if (n === ambito || !ts.isFunctionLike(n)) ts.forEachChild(n, buscar);
    };
    buscar(ambito);
    if (decl) return !!decl.initializer && llamaClienteDeSesion(a, decl.initializer);
  }
  return false;
}

/** ¿El nodo llama a una guardia: importada de su módulo, por `x.auth.getUser()` o por una función del mismo archivo que la llama? */
function protegido(a: Analisis, nodo: ts.Node, guardias: ReadonlyMap<string, Clase> = CLAVES_GUARDIA, vistos = new Set<string>()): boolean {
  let si = false;
  const visitar = (n: ts.Node): void => {
    if (si) return;
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      if (ts.isIdentifier(c)) {
        const imp = a.importados.get(c.text);
        if (imp && guardias.has(`${imp.modulo}#${imp.nombre}`)) return void (si = true);
        const local = a.locales.get(c.text);
        if (local && !vistos.has(c.text)) {
          vistos.add(c.text);
          if (protegido(a, local, guardias, vistos)) return void (si = true);
        }
      } else if (ts.isPropertyAccessExpression(c)) {
        // La sesión de Supabase: `sesion.auth.getUser()`, solo sobre el cliente de la sesión (`createSessionClient`). Con el
        // cliente de servicio, `getUser(token)` valida el token que mande el navegador, y sin token no dice nada de quién llama.
        if (c.name.text === "getUser" && ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === "auth" && esClienteDeSesion(a, c.expression.expression))
          return void (si = true);
        // `import * as auth from "@/lib/auth"` → `auth.requireModulo(...)`.
        if (ts.isIdentifier(c.expression) && a.espacios.has(c.expression.text) && guardias.has(`${a.espacios.get(c.expression.text)}#${c.name.text}`)) return void (si = true);
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(nodo);
  return si;
}

const sinGuardia = (a: Analisis) => a.puertas.filter((p) => !p.nodo || !protegido(a, p.nodo));

function archivosFuente(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n !== "node_modules") archivosFuente(p, out);
    } else if (/\.tsx?$/.test(n) && !/\.(test|d)\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

function leerModulo(modulo: string): string | null {
  for (const c of [`${modulo}.ts`, `${modulo}.tsx`, `${modulo}/index.ts`]) if (existsSync(join(RAIZ, c))) return c;
  return null;
}

const rel = (p: string) => relative(RAIZ, p).split("\\").join("/");
const analisis = archivosFuente(join(RAIZ, "src"))
  .map((p) => ({ archivo: rel(p), texto: readFileSync(p, "utf8") }))
  .filter(({ archivo, texto }) => texto.includes("use server") || /(^|\/)route\.tsx?$/.test(archivo))
  .map(({ archivo, texto }) => analizar(archivo, texto));
const clave = (archivo: string, funcion: string) => `${archivo}:${funcion}`;
const abiertas = analisis.flatMap(sinGuardia);
const permitidas = new Map(PUERTAS_PERMITIDAS.map((p) => [clave(p.archivo, p.funcion), p]));

test("cada acción de servidor y cada ruta revisa la sesión o está en la lista de permitidas", () => {
  const faltan = abiertas.filter((p) => !permitidas.has(clave(p.archivo, p.funcion)));
  assert.deepEqual(
    faltan.map((p) => `${p.archivo}:${p.linea} ${p.funcion}${p.nodo ? "" : ` (${p.porQue})`}`),
    [],
    "Estas puertas del servidor no llaman a ninguna guardia (requireModulo, requireModuloEscritura, getUsuarioActual, esPeticionDeCron, " +
      "una firma de webhook...). Agrega la revisión al inicio de la función; si de verdad es pública, anótala en " +
      "src/lib/seguridad/cierre-acciones-permitidas.ts con el motivo; si usa una guardia nueva, agrégala a GUARDIAS en esta prueba.",
  );
});

test("la lista de permitidas no tiene entradas viejas, repetidas ni sin motivo", () => {
  const abiertasClaves = new Set(abiertas.map((p) => clave(p.archivo, p.funcion)));
  const viejas = PUERTAS_PERMITIDAS.filter((p) => !abiertasClaves.has(clave(p.archivo, p.funcion))).map((p) => clave(p.archivo, p.funcion));
  assert.deepEqual(viejas, [], "Estas entradas ya no corresponden a una puerta sin guardia (se borró o ya revisa la sesión): quítalas de la lista.");
  assert.equal(permitidas.size, PUERTAS_PERMITIDAS.length, "Hay entradas repetidas en la lista de permitidas.");
  for (const p of PUERTAS_PERMITIDAS) assert.ok(p.motivo.trim().length >= 15, `Falta el motivo de ${clave(p.archivo, p.funcion)}.`);
});

test("la revisión encuentra las acciones y rutas del sistema (no está leyendo de menos)", () => {
  const modulos = analisis.filter((a) => a.esServidor);
  const rutas = analisis.filter((a) => a.esRuta && !a.esServidor);
  assert.ok(modulos.length >= 150, `Solo encontró ${modulos.length} archivos "use server".`);
  assert.ok(modulos.reduce((n, a) => n + a.puertas.length, 0) >= 600, "Encontró muy pocas acciones de servidor.");
  assert.ok(rutas.length >= 40, `Solo encontró ${rutas.length} archivos route.ts.`);
  // Un archivo que empieza con BOM (compras/actions.ts) también cuenta como "use server".
  assert.ok(modulos.some((a) => a.archivo === "src/app/(app)/compras/actions.ts" && a.puertas.length > 0));
});

test("cada guardia de la lista existe, y las derivadas de verdad llaman a una guardia", () => {
  // Una derivada vale si llama a una guardia base o a otra derivada que ya se comprobó (se repite hasta que no cambie nada,
  // así dos derivadas que solo se llaman entre sí no se dan por buenas).
  const comprobadas = new Map<string, Clase>([...CLAVES_GUARDIA].filter(([, c]) => c !== "derivada"));
  const pendientes: { clave: string; a: Analisis; nodo: ts.Node }[] = [];
  for (const g of GUARDIAS) {
    const archivo = leerModulo(g.modulo);
    assert.ok(archivo, `No existe el módulo ${g.modulo}.`);
    const a = analizar(archivo, readFileSync(join(RAIZ, archivo), "utf8"));
    for (const nombre of g.nombres) {
      const nodo = a.locales.get(nombre);
      assert.ok(nodo, `${g.modulo} ya no tiene ${nombre}.`);
      if (g.clase === "derivada") pendientes.push({ clave: `${g.modulo}#${nombre}`, a, nodo });
    }
  }
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const p of pendientes)
      if (!comprobadas.has(p.clave) && protegido(p.a, p.nodo, comprobadas)) {
        comprobadas.set(p.clave, "derivada");
        cambio = true;
      }
  }
  const falsas = pendientes.filter((p) => !comprobadas.has(p.clave)).map((p) => p.clave);
  assert.deepEqual(falsas, [], "Estas guardias derivadas ya no llaman a ninguna guardia: sácalas de GUARDIAS.");
});

// --- La revisión misma, sobre código de ejemplo ---

const abiertasDe = (archivo: string, texto: string) => sinGuardia(analizar(archivo, texto)).map((p) => p.funcion);

test("detecta una acción de servidor nueva sin guardia", () => {
  const ejemplo = `"use server";
import { requireModulo, requireModuloEscritura as escribir } from "@/lib/auth";
import * as auth from "../../../../lib/auth";
import { requireModulo as falsa } from "./mi-auth";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import type { X } from "./tipos";

async function permiso() { return escribir("compras"); }
const otroPaso = async () => permiso();
async function borrarTodo(id: string) { await createServiceClient().from("t").delete().eq("id", id); }

export async function conGuardia(id: string) { await requireModulo("compras"); await borrarTodo(id); }
export const conAyudante = async (id: string) => { await otroPaso(); await borrarTodo(id); };
export const conEspacio = async () => { await auth.getUsuarioActual(); };
export async function conSesionSupabase() { const s = await createSessionClient(); await s.auth.getUser(); }
export async function sinGuardia(id: string) { await borrarTodo(id); }
export const flecha = async (id: string) => { await createServiceClient().from("t").delete().eq("id", id); };
export async function guardiaDeOtroModulo() { await falsa("compras"); }
export async function guardiaQueNoSeLlama() { const f = () => requireModulo; return f; }
async function interna() {}
export { interna as renombrada };
export { otra } from "./otro-archivo";
export const LIMITE = 10;
`;
  assert.deepEqual(abiertasDe("src/app/(app)/compras/ejemplo/actions.ts", ejemplo), [
    "sinGuardia",
    "flecha",
    "guardiaDeOtroModulo",
    "guardiaQueNoSeLlama",
    "renombrada",
    "otra",
    "LIMITE",
  ]);
});

test("una función envuelta en paréntesis, as, satisfies o ! también es una puerta", () => {
  const ejemplo = `"use server";
import { requireModulo } from "@/lib/auth";
type Accion = (id: string) => Promise<void>;
export const entreParentesis = (async (id: string) => {});
export const conAs = (async (id: string) => {}) as Accion;
export const conSatisfies = (async (id: string) => {}) satisfies Accion;
export const conNoNulo = (async (id: string) => {})!;
export const conAngulos = <Accion>(async (id: string) => {});
export const envueltaConGuardia = (async (id: string) => { await requireModulo("x"); }) as Accion;
`;
  assert.deepEqual(abiertasDe("src/app/x/actions.ts", ejemplo), ["entreParentesis", "conAs", "conSatisfies", "conNoNulo", "conAngulos"]);
});

test("en un archivo \"use server\" todo valor exportado es una puerta; lo que no se entiende falla", () => {
  const ejemplo = `"use server";
import { requireModulo } from "@/lib/auth";
import { handlers } from "./handlers";
async function guardada() { await requireModulo("x"); }
export const alias = guardada;
export const deOtroObjeto = handlers.borrar;
export const objeto = { borrar: async () => {} };
export let sinValor: () => Promise<void>;
export default guardada;
`;
  assert.deepEqual(abiertasDe("src/app/x/actions.ts", ejemplo), ["deOtroObjeto", "objeto", "sinValor"]);
});

test("una exportación desestructurada falla (en route.ts y en \"use server\")", () => {
  const ruta = `import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { handlers } from "./auth";
export const { GET, POST } = handlers;
export const [PUT] = [async (r: Request) => { if (!esPeticionDeCron(r)) return; }];
`;
  assert.deepEqual(abiertasDe("src/app/api/x/route.ts", ruta), ["GET, POST", "PUT"]);
  assert.deepEqual(abiertasDe("src/app/x/actions.ts", `"use server";
export const { borrar, editar: cambiar } = acciones;`), ["borrar, cambiar"]);
});

test("x.auth.getUser() solo cuenta sobre el cliente de la sesión", () => {
  const ejemplo = `"use server";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { createSessionClient as otroCliente } from "./falso";
export async function sesion() { const s = await createSessionClient(); await s.auth.getUser(); }
export async function directo() { await (await createSessionClient()).auth.getUser(); }
export async function servicio() { const s = createServiceClient(); await s.auth.getUser(); }
export async function servicioDirecto() { await createServiceClient().auth.getUser("token"); }
export async function deOtroModulo() { const s = await otroCliente(); await s.auth.getUser(); }
export async function tapada() { const s = await createSessionClient(); const f = async () => { const s = createServiceClient(); await s.auth.getUser(); }; await f(); }
export async function sinDeclarar() { await s.auth.getUser(); }
`;
  assert.deepEqual(abiertasDe("src/app/x/actions.ts", ejemplo), ["servicio", "servicioDirecto", "deOtroModulo", "tapada", "sinDeclarar"]);
});

test("el mismo código sin \"use server\" no es una puerta (salvo una acción en línea)", () => {
  assert.deepEqual(abiertasDe("src/lib/x.ts", `export async function sinGuardia() {}`), []);
  assert.deepEqual(abiertasDe("src/lib/x.ts", `// comentario\n"use server";\nexport async function sinGuardia() {}`), ["sinGuardia"]);
  assert.deepEqual(
    abiertasDe("src/app/(app)/x/page.tsx", `export default function Pagina() { async function guardar() { "use server"; } return null; }`),
    ["guardar"],
  );
});

test("exigirAcceso cuenta como guardia; revisarAcceso o uno de otro módulo, no", () => {
  const ejemplo = `"use server";
import { exigirAcceso, revisarAcceso } from "@/lib/seguridad/exigir-acceso";
import { exigirAcceso as falsa } from "./exigir-acceso";
export async function conExigir(id: string) {
  const acceso = await exigirAcceso({ modulo: "bienes-de-uso", escritura: true, registros: { tabla: "fin_bienes_uso", ids: [id] } });
  if (acceso.error) return { error: acceso.error };
}
export async function soloRevisar(id: string) { await revisarAcceso(null, { modulo: "x" }); }
export async function deOtroModulo() { await falsa({ modulo: "x" }); }
`;
  assert.deepEqual(abiertasDe("src/app/(app)/bienes-de-uso/ejemplo/actions.ts", ejemplo), ["soloRevisar", "deOtroModulo"]);
});

test("en un route.ts revisa solo los métodos HTTP y reconoce cron y firmas", () => {
  const ejemplo = `import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { firmaValida } from "@/lib/instagram/firma";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) { if (!esPeticionDeCron(request)) return new Response(null, { status: 401 }); }
export async function POST(request: Request) { if (!firmaValida(await request.text(), null, process.env.S)) return new Response(null, { status: 401 }); }
export async function DELETE() { return new Response("ok"); }
function ayuda() {}
export { ayuda as PATCH };
`;
  assert.deepEqual(abiertasDe("src/app/api/ejemplo/route.ts", ejemplo), ["DELETE", "PATCH"]);
});

test("las rutas a módulos se resuelven igual con @/, relativas o con extensión", () => {
  assert.equal(moduloDe("src/lib/tareas/ruta.ts", "../seguridad/cron"), "src/lib/seguridad/cron");
  assert.equal(moduloDe("src/app/x/actions.ts", "@/lib/auth"), "src/lib/auth");
  assert.equal(moduloDe("src/app/x/actions.ts", "./datos.ts"), "src/app/x/datos");
  assert.equal(moduloDe("src/app/x/actions.ts", "../permisos/index"), "src/app/permisos");
  assert.equal(moduloDe("src/app/x/actions.ts", "next/cache"), "next/cache");
});
