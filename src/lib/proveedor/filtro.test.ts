import assert from "node:assert/strict";
import test from "node:test";
import { FILTRO_VACIO, filtroActivo, paisesDe, pasaFiltro } from "./filtro";

const ajo = [
  "Aged Garlic Extract Odorless Ajo 180 Softgel",
  "无味大蒜提取物",
  "ECOM02-0093",
];

test("sin filtro pasa todo", () => {
  assert.equal(pasaFiltro(FILTRO_VACIO, ajo, "MX"), true);
  assert.equal(filtroActivo(FILTRO_VACIO), false);
  assert.equal(filtroActivo({ buscar: "   ", pais: null }), false);
});

test("busca cada palabra en cualquier orden, sin acentos ni mayúsculas", () => {
  assert.equal(pasaFiltro({ buscar: "180 ajo", pais: null }, ajo, "MX"), true);
  assert.equal(
    pasaFiltro({ buscar: "ecom02-0093", pais: null }, ajo, "MX"),
    true,
  );
  assert.equal(pasaFiltro({ buscar: "大蒜", pais: null }, ajo, "MX"), true);
  assert.equal(
    pasaFiltro(
      { buscar: "colageno", pais: null },
      ["Multi-colágeno peptides"],
      "PA",
    ),
    true,
  );
  assert.equal(
    pasaFiltro({ buscar: "ajo magnesio", pais: null }, ajo, "MX"),
    false,
  );
});

test("filtra por país y junta los dos filtros", () => {
  assert.equal(pasaFiltro({ buscar: "", pais: "PA" }, ajo, "MX"), false);
  assert.equal(pasaFiltro({ buscar: "ajo", pais: "MX" }, ajo, "MX"), true);
  assert.equal(pasaFiltro({ buscar: "", pais: "—" }, ajo, null), true);
  assert.equal(filtroActivo({ buscar: "", pais: "CR" }), true);
});

test("lista los países en orden, sin país al final", () => {
  assert.deepEqual(paisesDe(["PA", null, "CR", "PA", "MX"]), [
    "CR",
    "MX",
    "PA",
    "—",
  ]);
  assert.deepEqual(paisesDe(["PA"]), ["PA"]);
});
