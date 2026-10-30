import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCiudades, textoParaBuscar } from "./ciudades";

test("lo escrito: al menos 2 letras y no más de 60", () => {
  assert.equal(textoParaBuscar("  San   José "), "San José");
  assert.equal(textoParaBuscar("C"), null);
  assert.equal(textoParaBuscar("12"), null);
  assert.equal(textoParaBuscar("a".repeat(61)), null);
});

test("una ciudad grande va antes que un pueblo que se llama igual, aunque el pueblo sea de un país cercano", () => {
  const r = leerCiudades({
    results: [
      { name: "Caracas", admin1: "Sucre", country: "Colombia", country_code: "CO", population: 300 },
      { name: "Caracas", admin1: "Distrito Federal", country: "Venezuela", country_code: "VE", population: 3000000 },
      { name: "San José", admin1: "California", country: "Estados Unidos", country_code: "US", population: 997368 },
    ],
  });
  assert.deepEqual(
    r.map((c) => c.etiqueta),
    ["Caracas, Venezuela", "San José, Estados Unidos", "Caracas, Colombia"],
  );
});

test("entre ciudades grandes, las de los países donde trabajamos van primero, luego por población", () => {
  const r = leerCiudades({
    results: [
      { name: "San José", admin1: "California", country: "Estados Unidos", country_code: "US", population: 997368 },
      { name: "San José", admin1: "Provincia de San José", country: "Costa Rica", country_code: "CR", population: 335007 },
      { name: "San Jose", admin1: "Caraga", country: "Filipinas", country_code: "PH", population: 26735 },
      { name: "San José del Guaviare", admin1: "Guaviare", country: "Colombia", country_code: "co", population: 68000 },
    ],
  });
  assert.deepEqual(
    r.map((c) => c.etiqueta),
    ["San José, Costa Rica", "San José del Guaviare, Colombia", "San José, Estados Unidos", "San Jose, Filipinas"],
  );
  assert.equal(r[1].codigo, "CO");
  assert.equal(r[0].region, "Provincia de San José");
});

test("sin repetir, con tope y descartando lo incompleto", () => {
  const r = leerCiudades(
    {
      results: [
        { name: "Caracas", admin1: "Distrito Federal", country: "Venezuela", country_code: "VE", population: 3000000 },
        { name: "Caracas", admin1: "Distrito Federal", country: "Venezuela", country_code: "VE", population: 3000000 },
        { name: "Caracas", country: "Venezuela" },
        { name: "", country: "Cuba", country_code: "CU" },
        null,
        { name: "Caracas", admin1: "Estado Monagas", country: "Venezuela", country_code: "VE" },
      ],
    },
    1,
  );
  assert.deepEqual(r, [{ etiqueta: "Caracas, Venezuela", nombre: "Caracas", region: "Distrito Federal", pais: "Venezuela", codigo: "VE" }]);
  assert.deepEqual(leerCiudades(null), []);
  assert.deepEqual(leerCiudades({ results: "x" }), []);
});
