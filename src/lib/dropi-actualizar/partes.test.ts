import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CUENTAS, LECTORES, LECTORES_PAIS, PARTES, archivoSubido, diasPrimeraLectura, lectoresDe, puedeActualizarDropi, sesionValida } from "./partes";

const ext = (f: string) => readFileSync(`extension/ecomfive-dropi/${f}`, "utf8");

test("los lectores de la extensión son copias exactas de los que usan las tareas programadas", () => {
  assert.equal(ext("lectores/dropi-diario.js"), readFileSync("scripts/dropi-diario-navegador.js", "utf8"));
  assert.equal(ext("lectores/ventas-dropi.js"), readFileSync("scripts/ventas-dropi-navegador.js", "utf8"));
});

test("la extensión conoce los mismos lectores que el panel (archivo, función, avance y archivos que sube)", () => {
  const fondo = ext("fondo.js");
  for (const [clave, l] of Object.entries(LECTORES)) {
    assert.ok(fondo.includes(`${clave}: { pais: "${l.pais}", archivo: "${l.archivo}", funcion: "${l.funcion}", estado: "${l.estado}", archivos: ${JSON.stringify(l.archivos).replace(/,/g, ", ")} }`), clave);
    assert.ok(ext(l.archivo).includes(`async function ${l.funcion}(`), l.archivo);
  }
});

test("la extensión solo sube a la carpeta temporal del sistema en SU proyecto de Supabase", () => {
  const fuente = /const SUBIDA = \/(.+)\/;/.exec(ext("fondo.js"))![1];
  const subida = new RegExp(fuente);
  const id = "01a17000-1234-7abc-8def-0123456789ab";
  const sistema = "https://bcpndbpxbcfruivgizjn.supabase.co";
  assert.ok(subida.test(`${sistema}/storage/v1/object/upload/sign/wms-compras/tmp-dropi-panel/${id}/pedidos.json?token=xyz`));
  // Otro proyecto de Supabase con la misma carpeta ya no pasa (auditoría 27 oct 2026).
  assert.ok(!subida.test(`https://abcdefgh.supabase.co/storage/v1/object/upload/sign/wms-compras/tmp-dropi-panel/${id}/pedidos.json?token=xyz`));
  assert.ok(!subida.test(`${sistema}/storage/v1/object/upload/sign/otro-bucket/tmp-dropi-panel/${id}/pedidos.json?token=xyz`));
  assert.ok(!subida.test(`https://evil.example.com/storage/v1/object/upload/sign/wms-compras/tmp-dropi-panel/${id}/pedidos.json?token=xyz`));
  assert.ok(!subida.test(`${sistema}/storage/v1/object/upload/sign/wms-compras/tmp-dropi-panel/../x/pedidos.json?token=xyz`));
});

test("el puente solo va en las páginas del sistema y la extensión solo entra a Dropi", () => {
  const m = JSON.parse(ext("manifest.json")) as { host_permissions: string[]; content_scripts: { matches: string[] }[]; permissions: string[] };
  assert.deepEqual(m.host_permissions, ["https://app.dropi.pa/*", "https://app.dropi.cr/*", "https://app.dropi.mx/*"]);
  // Solo la página del sistema: ninguna página de localhost puede usar la sesión de Dropi (auditoría 27 oct 2026).
  assert.deepEqual(m.content_scripts[0].matches, ["https://mom-beta-proveduria.vercel.app/*"]);
  assert.ok(ext("fondo.js").includes(`remitente.origin !== SISTEMA`));
  assert.ok(!m.permissions.includes("tabs") && !m.permissions.includes("cookies"));
});

test("la sesión de Panamá tiene que ser la de proveedor ECOMFIVE y no estar por vencer", () => {
  const ahora = Date.parse("2026-10-26T15:00:00Z");
  const base = { hay: true, tipoUsuario: "SUPPLIER", tienda: "ECOMFIVE", vence: "2026-10-26T23:00:00Z" };
  assert.equal(sesionValida("pa", base, ahora), "ok");
  assert.equal(sesionValida("pa", null, ahora), "sin_sesion");
  assert.equal(sesionValida("pa", { ...base, hay: false }, ahora), "sin_sesion");
  assert.equal(sesionValida("pa", { ...base, tipoUsuario: "DROPSHIPPER" }, ahora), "otra_cuenta");
  assert.equal(sesionValida("pa", { ...base, tienda: "OTRA" }, ahora), "otra_cuenta");
  assert.equal(sesionValida("pa", { ...base, vence: "2026-10-26T15:00:30Z" }, ahora), "vencida");
  assert.equal(CUENTAS.pa.origen, "https://app.dropi.pa");
  // México: cualquier cuenta que no sea de proveedor (la de proveedor no ve el catálogo).
  assert.equal(sesionValida("mx", { hay: true, tipoUsuario: "DROPSHIPPER", tienda: null, vence: null }, ahora), "ok");
  assert.equal(sesionValida("mx", { hay: true, tipoUsuario: "SUPPLIER", tienda: "X", vence: null }, ahora), "otra_cuenta");
});

test("Costa Rica: sus partes, sus lectores en app.dropi.cr y sus archivos con otro nombre que los de Panamá", () => {
  const cr = PARTES.filter((p) => p.pais === "cr");
  assert.deepEqual(cr.map((p) => p.tipo), ["pedidos", "cartera", "retiros", "stock", "ventas"]);
  assert.deepEqual(lectoresDe(cr.map((p) => p.clave)), LECTORES_PAIS.cr);
  assert.deepEqual(lectoresDe(["ventas_cr", "pedidos"]), ["proveedor", "ventas_cr"]);
  assert.equal(CUENTAS.cr.origen, "https://app.dropi.cr");
  assert.equal(archivoSubido("proveedor", "pedidos"), "pedidos");
  assert.equal(archivoSubido("proveedor_cr", "pedidos"), "pedidoscr");
  // Los nombres de Costa Rica pasan el filtro de la extensión (solo letras antes de .json).
  assert.match(`${archivoSubido("ventas_cr", "movimientos")}.json`, /^[a-z]+\.json$/);
  // La cuenta de proveedor de Costa Rica, sin exigir el nombre de la tienda; una de dropshipper no sirve.
  const ahora = Date.parse("2026-10-28T15:00:00Z");
  assert.equal(sesionValida("cr", { hay: true, tipoUsuario: "SUPPLIER", tienda: "ECOMFIVE CR", vence: null }, ahora), "ok");
  assert.equal(sesionValida("cr", { hay: true, tipoUsuario: "DROPSHIPPER", tienda: null, vence: null }, ahora), "otra_cuenta");
});

test("la primera lectura (y «Traer historial») de Costa Rica trae desde el 1 de abril de 2026; Panamá, los días de siempre", () => {
  assert.deepEqual(diasPrimeraLectura("cr", new Date("2026-10-29T15:00:00Z")), { pedidos: 212, cartera: 212 });
  assert.equal(diasPrimeraLectura("pa", new Date("2026-10-29T15:00:00Z")), null);
  // Si ya pasaron menos de 30 días desde esa fecha, bastan los de siempre.
  assert.equal(diasPrimeraLectura("cr", new Date("2026-04-20T15:00:00Z")), null);
});

test("qué lectores corren según lo elegido, y quién ve el botón", () => {
  assert.deepEqual(lectoresDe(["ventas"]), ["ventas"]);
  assert.deepEqual(lectoresDe(["stock", "ventas", "pedidos"]), ["proveedor", "ventas"]);
  assert.deepEqual(lectoresDe([]), []);
  assert.equal(PARTES.filter((p) => p.lector === "proveedor").length, LECTORES.proveedor.archivos.length);
  assert.ok(puedeActualizarDropi({ email: "Hernan@ecomfive.io " }));
  assert.ok(!puedeActualizarDropi({ email: "francis@ecomfive.io" }));
  assert.ok(!puedeActualizarDropi({ email: null }));
});
