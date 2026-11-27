import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDanado, diasDesde, marcasDeDanado, revisarTrasladoDanado } from "./defectuosos";

test("de cada producto y bodega, la última vez y la primera que entró algo a dañado", () => {
  const m = (danado: number, creadoEn: string, motivo: string, bodegaId = "b1") => ({ skuId: "s1", bodegaId, danado, creadoEn, motivo, referencia: "Defectuoso", usuarioId: "u1" });
  const marcas = marcasDeDanado([m(3, "2026-11-20T15:00:00Z", "caja rota"), m(-1, "2026-11-25T15:00:00Z", "vuelve"), m(2, "2026-11-24T15:00:00Z", "golpe"), m(5, "2026-11-10T15:00:00Z", "mojado"), m(1, "2026-11-26T10:00:00Z", "otra", "b2")]);
  const a = marcas.get(claveDanado("s1", "b1"))!;
  assert.equal(a.fecha, "2026-11-24T15:00:00Z");
  assert.equal(a.motivo, "golpe");
  assert.equal(a.primera, "2026-11-10T15:00:00Z");
  assert.equal(marcas.get(claveDanado("s1", "b2"))?.motivo, "otra");
  assert.equal(marcas.size, 2);
});

test("los días desde que se marcó, en hora de Panamá", () => {
  assert.equal(diasDesde("2026-11-20T15:00:00Z", "2026-11-27"), 7);
  // A las 2 a. m. UTC del 27 todavía es el 26 en Panamá.
  assert.equal(diasDesde("2026-11-27T02:00:00Z", "2026-11-27"), 1);
  assert.equal(diasDesde("2026-11-27T20:00:00Z", "2026-11-27"), 0);
});

test("el traslado de unidades dañadas: otra bodega, una cantidad válida y un motivo corto", () => {
  assert.deepEqual(revisarTrasladoDanado({ desde: "b1", hacia: "b2", cantidad: "3", danado: 5, motivo: "  para   garantía " }), { hacia: "b2", cantidad: 3, motivo: "para garantía" });
  assert.deepEqual(revisarTrasladoDanado({ desde: "b1", hacia: "b2", cantidad: 5, danado: 5 }), { hacia: "b2", cantidad: 5, motivo: null });
  assert.ok("error" in revisarTrasladoDanado({ desde: "b1", hacia: "b1", cantidad: 1, danado: 5 }));
  assert.ok("error" in revisarTrasladoDanado({ desde: "b1", hacia: "", cantidad: 1, danado: 5 }));
  assert.ok("error" in revisarTrasladoDanado({ desde: "b1", hacia: "b2", cantidad: 6, danado: 5 }));
  assert.ok("error" in revisarTrasladoDanado({ desde: "b1", hacia: "b2", cantidad: 1.5, danado: 5 }));
  assert.ok("error" in revisarTrasladoDanado({ desde: "b1", hacia: "b2", cantidad: 0, danado: 5 }));
});
