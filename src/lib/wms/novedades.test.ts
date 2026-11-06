import assert from "node:assert/strict";
import { test } from "node:test";
import { motivoNoResolver, numeroNovedad, resultadoValido, revisarNovedad } from "./novedades";

const B = "01a1364c-f839-7da8-b333-121b076154e5";
const S = "01a1364c-f839-7da8-b333-121b076154e6";
const FOTO = "novedades/01a1364c-f839-7da8-b333-121b076154e7/1793-foto.jpg";
const base = { tipo: "devolucion", bodega: B, sku: S, cantidad: 2 };

test("una devolución necesita plataforma, producto y cantidad", () => {
  assert.deepEqual(revisarNovedad({ ...base, referencia: "  guía   123 ", nota: "" }), { tipo: "devolucion", bodega: B, sku: S, cantidad: 2, referencia: "guía 123", nota: null, foto: null, retornoOficina: false });
  assert.ok("error" in revisarNovedad({ ...base, tipo: "otro" }));
  assert.ok("error" in revisarNovedad({ ...base, bodega: "" }));
  assert.ok("error" in revisarNovedad({ ...base, sku: "x" }));
  assert.ok("error" in revisarNovedad({ ...base, cantidad: 0 }));
  assert.ok("error" in revisarNovedad({ ...base, cantidad: 1.5 }));
});

test("un dañado necesita su prueba: la foto o el retorno a la oficina", () => {
  assert.match((revisarNovedad({ ...base, tipo: "danado" }) as { error: string }).error, /foto/);
  assert.ok("tipo" in revisarNovedad({ ...base, tipo: "danado", foto: FOTO }));
  assert.ok("tipo" in revisarNovedad({ ...base, tipo: "danado", retornoOficina: true }));
  assert.ok("error" in revisarNovedad({ ...base, tipo: "danado", foto: "https://otro.sitio/x.jpg" }));
});

test("quien reporta un dañado no lo confirma; una devolución la resuelve cualquiera", () => {
  const danado = { tipo: "danado" as const, estado: "por_revisar" as const, autorizaA: ["yanixia", "hernan"], creadoPor: "hernan" };
  assert.equal(motivoNoResolver(danado, "yanixia"), null);
  assert.match(String(motivoNoResolver(danado, "hernan")), /reportó/);
  assert.match(String(motivoNoResolver(danado, "otra")), /autoriza/);
  assert.equal(motivoNoResolver({ ...danado, tipo: "devolucion" }, "hernan"), null);
  assert.match(String(motivoNoResolver({ ...danado, estado: "baja" }, "yanixia")), /ya se resolvió/);
});

test("cada novedad tiene sus resultados", () => {
  assert.equal(resultadoValido("danado", "baja"), true);
  assert.equal(resultadoValido("danado", "vuelve"), false);
  assert.equal(resultadoValido("devolucion", "no_vuelve"), true);
  assert.equal(resultadoValido("devolucion", "reclamo"), false);
  assert.equal(numeroNovedad(12), "NOV-0012");
});
