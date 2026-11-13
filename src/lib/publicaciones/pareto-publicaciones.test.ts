import assert from "node:assert/strict";
import test from "node:test";
import { guiasDeLosMeses, guiasPorIdDeFilas, guiasPorPublicacion, paretoPublicaciones, publicacionDeCadaId } from "./pareto-publicaciones";

const pub = (id: string, dropiId: string, extra: { archivada?: boolean; duplicadaDe?: string | null } = {}) => ({ id, dropiId, archivada: false, duplicadaDe: null, ...extra });

test("una publicación con dos IDs suma los dos; un ID sin publicación va aparte", () => {
  const de = publicacionDeCadaId([pub("a", "6667-8295"), pub("b", "7820")]);
  const g = guiasPorPublicacion({ "6667": 10, "8295": 5, "7820": 3, "9999": 2, "1111": 0 }, de);
  assert.deepEqual(Object.fromEntries(g), { a: 15, b: 3, "dropi:9999": 2 });
});

test("un ID repetido es de la publicación que no es duplicada y, después, de la que no está archivada", () => {
  const de = publicacionDeCadaId([pub("vieja", "7820", { archivada: true }), pub("dup", "7820", { duplicadaDe: "PUB-0001" }), pub("buena", "7820")]);
  assert.equal(de.get("7820"), "buena");
  assert.equal(publicacionDeCadaId([pub("dup", "7820", { duplicadaDe: "PUB-0001" }), pub("vieja", "7820", { archivada: true })]).get("7820"), "vieja");
});

test("el 20 % de las publicaciones y su parte de las guías", () => {
  const pubs = Array.from({ length: 10 }, (_, i) => pub(`p${i}`, String(1000 + i)));
  const guias = Object.fromEntries(pubs.map((p, i) => [p.dropiId, i === 0 ? 80 : i === 1 ? 10 : 1]));
  const r = paretoPublicaciones(guias, publicacionDeCadaId(pubs));
  assert.equal(r.n, 10);
  assert.equal(r.grupos.top.n, 2);
  assert.deepEqual(r.filas.slice(0, 2).map((f) => f.id), ["p0", "p1"]);
  assert.equal(r.cumple8020, true);
});

test("las filas de la base: meses en orden, los 30 días aparte y la suma de los últimos meses", () => {
  const meses = ["2026-09-01", "2026-10-01", "2026-11-01"];
  const { porMes, dias30 } = guiasPorIdDeFilas(
    [
      { producto_id: 7820, mes: "2026-10-01", pedidos: 4, pedidos_30: 1 },
      { producto_id: 7820, mes: "2026-11-01", pedidos: 6, pedidos_30: 6 },
      { producto_id: "8701", mes: "2026-09-01", pedidos: 2, pedidos_30: 0 },
      { producto_id: 8701, mes: "2025-01-01", pedidos: 9, pedidos_30: 0 },
    ],
    meses,
  );
  assert.deepEqual(porMes, { "7820": [0, 4, 6], "8701": [2, 0, 0] });
  assert.deepEqual(dias30, { "7820": 7 });
  assert.deepEqual(guiasDeLosMeses(porMes, 2), { "7820": 10, "8701": 0 });
});
