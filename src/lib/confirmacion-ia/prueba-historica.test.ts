import { test } from "node:test";
import assert from "node:assert/strict";
import { decidioUnaSolaIA, huellaDeId, lugaresConDesacuerdo, muestraBalanceada, resumirPrueba, veredictoDe, zonaDominante, type PedidoMuestra, type ResultadoPrueba } from "./prueba-historica";

const pedido = (id: string, tiendaId: string, real: "ciudad" | "interior"): PedidoMuestra => ({ id, tiendaId, real });

test("la muestra se reparte entre tiendas y zonas, y es siempre la misma", () => {
  const pedidos: PedidoMuestra[] = [];
  for (let i = 0; i < 200; i++) pedidos.push(pedido(`o${i}`, "oferfy", i % 2 ? "ciudad" : "interior"));
  for (let i = 0; i < 6; i++) pedidos.push(pedido(`k${i}`, "kenku", i % 2 ? "ciudad" : "interior"));
  const m = muestraBalanceada(pedidos, 12);
  assert.equal(m.length, 12);
  assert.equal(m.filter((p) => p.tiendaId === "kenku").length, 6, "Kenku no queda tapada por Oferfy");
  assert.equal(m.filter((p) => p.real === "ciudad").length, 6);
  assert.deepEqual(muestraBalanceada(pedidos, 12).map((p) => p.id), m.map((p) => p.id));
  assert.equal(muestraBalanceada(pedidos.slice(0, 3), 50).length, 3);
  assert.equal(huellaDeId("abc"), huellaDeId("abc"));
});

const r = (extra: Partial<ResultadoPrueba>): ResultadoPrueba => ({ id: "1", numero: "#1", tienda: "Kenku", tiendaId: "k", ciudad: "Tocumen", direccion: "x", real: "ciudad", estado: "listo", zona: "ciudad", zonaPor: "ia", falta: null, motivo: "", modelos: [], reglas: [], ...extra });

test("el veredicto: acierta, falla o no decide", () => {
  assert.equal(veredictoDe(r({})), "acerto");
  assert.equal(veredictoDe(r({ zona: "interior" })), "fallo");
  assert.equal(veredictoDe(r({ estado: "falta_dato", zona: null })), "sin_decision");
  assert.equal(veredictoDe(r({ estado: "revisar", zona: null })), "sin_decision");
  assert.equal(veredictoDe(r({ estado: "adelantado", zona: "adelantado" })), "sin_decision");
});

test("el resumen cuenta aciertos, fallos, lo no decidido, la matriz y quién decidió", () => {
  const s = resumirPrueba([
    r({ id: "a" }),
    r({ id: "b", zona: "interior", zonaPor: "regla" }),
    r({ id: "c", real: "interior", zona: "interior", tienda: "Nuvo" }),
    r({ id: "d", real: "interior", estado: "falta_dato", zona: null, zonaPor: null, tienda: "Nuvo" }),
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.acerto, 2);
  assert.equal(s.fallo, 1);
  assert.equal(s.sinDecision, 1);
  assert.equal(s.precision, 2 / 3);
  assert.equal(s.cobertura, 3 / 4);
  assert.deepEqual(s.matriz.ciudad, { ciudad: 1, interior: 1, sinDecision: 0 });
  assert.deepEqual(s.matriz.interior, { ciudad: 0, interior: 1, sinDecision: 1 });
  assert.deepEqual(s.porQuien, { regla: { total: 1, acerto: 0 }, ia: { total: 2, acerto: 2 } });
  assert.deepEqual(s.porTienda.map((t) => [t.tienda, t.total, t.acerto]), [["Kenku", 2, 1], ["Nuvo", 2, 1]]);
  assert.equal(resumirPrueba([]).precision, null);
});

test("cuenta aparte lo que decidió una sola IA", () => {
  const m = (proveedor: string, zona: string | null) => ({ proveedor, ok: true, zona, completa: true, motivo: null });
  const una = r({ id: "u1", modelos: [m("openai", "no_se"), m("anthropic", "ciudad")] });
  const dos = r({ id: "u2", modelos: [m("openai", "ciudad"), m("anthropic", "ciudad")] });
  const fallo = r({ id: "u3", zona: "interior", modelos: [m("openai", "no_se"), m("anthropic", "interior")] });
  assert.equal(decidioUnaSolaIA(una), true);
  assert.equal(decidioUnaSolaIA(dos), false);
  assert.equal(decidioUnaSolaIA(r({ zonaPor: "regla", modelos: [m("openai", "no_se"), m("anthropic", "ciudad")] })), false);
  assert.equal(decidioUnaSolaIA(r({ modelos: [m("anthropic", "ciudad")] })), false, "con una sola IA conectada no cuenta");
  assert.deepEqual(resumirPrueba([una, dos, fallo]).unaSolaIA, { total: 2, acerto: 1 });
});

test("los lugares con más desacuerdo y su zona dominante", () => {
  const l = lugaresConDesacuerdo([
    r({ id: "1", ciudad: "Pacora", real: "ciudad", zona: "interior" }),
    r({ id: "2", ciudad: "pacora", real: "ciudad", zona: "interior" }),
    r({ id: "3", ciudad: "Pacora", real: "ciudad", zona: "ciudad" }),
    r({ id: "4", ciudad: "Colón", real: "interior", zona: "interior" }),
    r({ id: "5", ciudad: "Tocumen", real: "ciudad", zona: "interior" }),
  ]);
  assert.deepEqual(l.map((x) => [x.lugar, x.total, x.fallos]), [["Pacora", 3, 2]]);
  assert.equal(zonaDominante(l[0]), "ciudad");
  assert.equal(zonaDominante({ ciudad: 2, interior: 1 }), null, "mixto");
  assert.equal(zonaDominante({ ciudad: 2, interior: 0 }), null, "muy pocos");
});
