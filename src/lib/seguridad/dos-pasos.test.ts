// Verificación en dos pasos (seguridad · 19 nov 2026): quién la debe tener, qué decide el nivel de la sesión y el interruptor.
import assert from "node:assert/strict";
import { test } from "node:test";
import { esAdministrador } from "../permisos/acceso";
import {
  bloqueaPorDosPasos,
  claveEnGrupos,
  destinoTrasDosPasos,
  dosPasosObligatorio,
  estadoDosPasos,
  factorVerificado,
  limpiarCodigo,
  nivelDelToken,
  qrComoImagen,
  rutaDosPasosDesde,
  tieneFactorVerificado,
} from "./dos-pasos";

const token = (carga: object) => `x.${Buffer.from(JSON.stringify(carga)).toString("base64url")}.firma`;

test("interruptor DOS_PASOS_ADMIN: solo 1 o true lo prenden", () => {
  assert.equal(dosPasosObligatorio({}), false);
  assert.equal(dosPasosObligatorio({ DOS_PASOS_ADMIN: "" }), false);
  assert.equal(dosPasosObligatorio({ DOS_PASOS_ADMIN: "0" }), false);
  assert.equal(dosPasosObligatorio({ DOS_PASOS_ADMIN: "no" }), false);
  assert.equal(dosPasosObligatorio({ DOS_PASOS_ADMIN: "1" }), true);
  assert.equal(dosPasosObligatorio({ DOS_PASOS_ADMIN: " TRUE " }), true);
});

test("la deben tener quienes pueden modificar Usuarios y roles", () => {
  assert.equal(esAdministrador({ modulos: ["usuarios", "compras"], modulosSoloLectura: [] }), true);
  assert.equal(esAdministrador({ modulos: ["usuarios"], modulosSoloLectura: ["usuarios"] }), false);
  assert.equal(esAdministrador({ modulos: ["compras"], modulosSoloLectura: [] }), false);
});

test("estado: aal2 siempre pasa; con factor y aal1 pide el código, prendido o no", () => {
  for (const obligatorio of [true, false])
    for (const administra of [true, false]) {
      assert.equal(estadoDosPasos({ administra, nivel: "aal2", tieneFactor: true, obligatorio }), "listo");
      assert.equal(estadoDosPasos({ administra, nivel: "aal1", tieneFactor: true, obligatorio }), "pedir-codigo");
      assert.equal(estadoDosPasos({ administra, nivel: null, tieneFactor: true, obligatorio }), "pedir-codigo");
    }
});

test("estado: admin sin factor se bloquea solo con el interruptor; sin él, se le invita", () => {
  assert.equal(estadoDosPasos({ administra: true, nivel: "aal1", tieneFactor: false, obligatorio: true }), "activar");
  assert.equal(estadoDosPasos({ administra: true, nivel: "aal1", tieneFactor: false, obligatorio: false }), "invitar");
  assert.equal(estadoDosPasos({ administra: false, nivel: "aal1", tieneFactor: false, obligatorio: true }), "libre");
  assert.equal(estadoDosPasos({ administra: false, nivel: "aal1", tieneFactor: false, obligatorio: false }), "libre");
});

test("qué estados bloquean", () => {
  assert.equal(bloqueaPorDosPasos("pedir-codigo"), true);
  assert.equal(bloqueaPorDosPasos("activar"), true);
  assert.equal(bloqueaPorDosPasos("invitar"), false);
  assert.equal(bloqueaPorDosPasos("libre"), false);
  assert.equal(bloqueaPorDosPasos("listo"), false);
  assert.equal(bloqueaPorDosPasos(null), false);
});

test("factores: solo cuenta un TOTP confirmado", () => {
  assert.equal(tieneFactorVerificado(undefined), false);
  assert.equal(tieneFactorVerificado([{ id: "a", factor_type: "totp", status: "unverified" }]), false);
  assert.equal(tieneFactorVerificado([{ id: "a", factor_type: "phone", status: "verified" }]), false);
  assert.equal(tieneFactorVerificado([{ id: "a", factor_type: "totp", status: "verified" }]), true);
  assert.equal(factorVerificado([{ id: "a", factor_type: "totp", status: "unverified" }, { id: "b", factor_type: "totp", status: "verified" }])?.id, "b");
});

test("nivel del token: aal2 solo si lo dice; lo raro vale aal1", () => {
  assert.equal(nivelDelToken(null), null);
  assert.equal(nivelDelToken(token({ aal: "aal2" })), "aal2");
  assert.equal(nivelDelToken(token({ aal: "aal1" })), "aal1");
  assert.equal(nivelDelToken(token({})), "aal1");
  assert.equal(nivelDelToken("no-es-un-token"), "aal1");
  assert.equal(nivelDelToken("a.@@@.c"), "aal1");
});

test("código: 6 números, se aceptan espacios y guiones", () => {
  assert.equal(limpiarCodigo("123456"), "123456");
  assert.equal(limpiarCodigo(" 123 456 "), "123456");
  assert.equal(limpiarCodigo("123-456"), "123456");
  assert.equal(limpiarCodigo("12345"), null);
  assert.equal(limpiarCodigo("1234567"), null);
  assert.equal(limpiarCodigo("12a456"), null);
  assert.equal(limpiarCodigo(undefined), null);
});

test("QR: el SVG de Supabase pasa a base64; otra cosa no", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  const img = qrComoImagen(`data:image/svg+xml;utf-8,${svg}`);
  assert.ok(img?.startsWith("data:image/svg+xml;base64,"));
  assert.equal(Buffer.from(img!.split(",")[1], "base64").toString("utf8"), svg);
  assert.equal(qrComoImagen(svg), img);
  assert.equal(qrComoImagen(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`), img);
  assert.equal(qrComoImagen("data:text/html,<svg></svg>"), null);
  assert.equal(qrComoImagen("<script>alert(1)</script>"), null);
  assert.equal(qrComoImagen(""), null);
});

test("QR: acepta el encabezado que trae el SVG de Supabase (xml, comentario, doctype)", () => {
  const svgo = '<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  const img = qrComoImagen(`data:image/svg+xml;utf-8,${svgo}`);
  assert.ok(img?.startsWith("data:image/svg+xml;base64,"));
  assert.equal(Buffer.from(img!.split(",")[1], "base64").toString("utf8"), svgo);
  const conDoctype = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><svg xmlns="http://www.w3.org/2000/svg"/>';
  assert.ok(qrComoImagen(conDoctype));
  // Lo que no es encabezado, antes del <svg>, no pasa.
  assert.equal(qrComoImagen('<?xml version="1.0"?><script>alert(1)</script><svg></svg>'), null);
  assert.equal(qrComoImagen("<!-- x --><html><svg></svg></html>"), null);
});

test("clave para escribir a mano en grupos de 4", () => {
  assert.equal(claveEnGrupos("abcd2345efgh"), "ABCD 2345 EFGH");
  assert.equal(claveEnGrupos("ABCDE"), "ABCD E");
  assert.equal(claveEnGrupos(null), "");
});

test("destino tras el código: solo rutas propias y nunca de vuelta a /dos-pasos o /login", () => {
  assert.equal(destinoTrasDosPasos("/compras/lista?abrir=1"), "/compras/lista?abrir=1");
  assert.equal(destinoTrasDosPasos(null), "/");
  assert.equal(destinoTrasDosPasos("https://otro.sitio"), "/");
  assert.equal(destinoTrasDosPasos("//otro.sitio"), "/");
  assert.equal(destinoTrasDosPasos("/\\otro.sitio"), "/");
  assert.equal(destinoTrasDosPasos("/dos-pasos?volver=/x"), "/");
  assert.equal(destinoTrasDosPasos("/login"), "/");
  assert.equal(destinoTrasDosPasos("/ruta\nmala"), "/");
  assert.equal(rutaDosPasosDesde("/"), "/dos-pasos");
  assert.equal(rutaDosPasosDesde(null), "/dos-pasos");
  assert.equal(rutaDosPasosDesde("/compras?a=1"), "/dos-pasos?volver=%2Fcompras%3Fa%3D1");
});
