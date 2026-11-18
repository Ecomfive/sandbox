import test from "node:test";
import assert from "node:assert/strict";
import { accionesDelMensajero, cambioDeMensajero, DIAS_ENLACE, enlaceVencido, hashToken, nuevoToken, tokenPlausible } from "./mensajero";
import { MOTIVOS_FALLO } from "./operacion";

test("el código es largo, único y solo se guarda su hash", () => {
  const a = nuevoToken();
  const b = nuevoToken();
  assert.ok(tokenPlausible(a) && a !== b);
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), a);
  assert.equal(hashToken(a), hashToken(a));
});
test("rechaza códigos con otra forma", () => {
  for (const x of ["", "corto", "a".repeat(33), `${"a".repeat(31)}/`, null, 5]) assert.equal(tokenPlausible(x), false);
});
test("solo mueve las órdenes en ruta y suyas", () => {
  assert.deepEqual(accionesDelMensajero({ fase: "despachada", repartidor_id: "r1" }, "r1"), ["entregada", "fallida"]);
  assert.deepEqual(accionesDelMensajero({ fase: "despachada", repartidor_id: "r2" }, "r1"), []);
  assert.deepEqual(accionesDelMensajero({ fase: "confirmada", repartidor_id: "r1" }, "r1"), []);
  assert.deepEqual(accionesDelMensajero({ fase: "entregada", repartidor_id: "r1" }, "r1"), []);
});
test("no deja pasar a quién va la orden ni la guía", () => {
  const c = cambioDeMensajero("entregada", { cobrado: "12.5", recibeNombre: " Ana ", repartidorId: "otro", guia: "X", transportista: "Y" });
  assert.deepEqual(Object.keys(c).sort(), ["cobrado", "codigo", "motivoDiferencia", "recibeDocumento", "recibeNombre"]);
  assert.equal(c.cobrado, 12.5);
  assert.equal(c.recibeNombre, "Ana");
  assert.equal(cambioDeMensajero("entregada", { cobrado: "abc" }).cobrado, null);
});
test("el fallo solo acepta motivos de la lista", () => {
  const ok = MOTIVOS_FALLO[0].codigo;
  assert.equal(cambioDeMensajero("fallida", { motivoCodigo: ok }).motivoCodigo, ok);
  assert.equal(cambioDeMensajero("fallida", { motivoCodigo: "inventado" }).motivoCodigo, null);
  assert.equal(cambioDeMensajero("fallida", { reprogramadaPara: "no es fecha" }).reprogramadaPara, null);
});

test("el enlace del mensajero vence a los DIAS_ENLACE días", () => {
  const ahora = Date.parse("2026-11-18T12:00:00Z");
  assert.equal(enlaceVencido("2026-11-10T12:00:00Z", ahora), false);
  assert.equal(enlaceVencido(new Date(ahora - DIAS_ENLACE * 86_400_000 - 1000).toISOString(), ahora), true);
  assert.equal(enlaceVencido(null, ahora), true);
  assert.equal(enlaceVencido("no es fecha", ahora), true);
});
