import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CUENTAS, LECTORES, PARTES, lectoresDe, puedeActualizarDropi, sesionValida } from "./partes";

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

test("la extensión solo sube a la carpeta temporal del sistema en Supabase", () => {
  const fuente = /const SUBIDA = \/(.+)\/;/.exec(ext("fondo.js"))![1];
  const subida = new RegExp(fuente);
  const id = "01a17000-1234-7abc-8def-0123456789ab";
  assert.ok(subida.test(`https://abcdefgh.supabase.co/storage/v1/object/upload/sign/wms-compras/tmp-dropi-panel/${id}/pedidos.json?token=xyz`));
  assert.ok(!subida.test(`https://abcdefgh.supabase.co/storage/v1/object/upload/sign/otro-bucket/tmp-dropi-panel/${id}/pedidos.json?token=xyz`));
  assert.ok(!subida.test(`https://evil.example.com/storage/v1/object/upload/sign/wms-compras/tmp-dropi-panel/${id}/pedidos.json?token=xyz`));
  assert.ok(!subida.test(`https://abcdefgh.supabase.co/storage/v1/object/upload/sign/wms-compras/tmp-dropi-panel/../x/pedidos.json?token=xyz`));
});

test("el puente solo va en las páginas del sistema y la extensión solo entra a Dropi", () => {
  const m = JSON.parse(ext("manifest.json")) as { host_permissions: string[]; content_scripts: { matches: string[] }[]; permissions: string[] };
  assert.deepEqual(m.host_permissions, ["https://app.dropi.pa/*", "https://app.dropi.mx/*"]);
  assert.ok(m.content_scripts[0].matches.includes("https://mom-beta-proveduria.vercel.app/*"));
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
