import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conOpcion, FILTRO_SOLO_SIMPLES, filasDelTipo, opcionElegida } from "./tipo-producto";
import type { Filtro } from "./motor";

const sel = (campo: string, ...valores: string[]): Filtro => ({ campo, valor: { tipo: "seleccion", valores } });

describe("selector de tipo de producto", () => {
  it("sin filtro del campo, o con otros valores, es «todos»", () => {
    assert.equal(opcionElegida([], "tipo", "simple", "combo"), "todos");
    assert.equal(opcionElegida([sel("clase", "fisico")], "tipo", "simple", "combo"), "todos");
    assert.equal(opcionElegida([sel("tipo", "simple", "combo")], "tipo", "simple", "combo"), "todos");
  });
  it("un solo valor es esa opción", () => {
    assert.equal(opcionElegida([sel("tipo", "simple")], "tipo", "simple", "combo"), "simple");
    assert.equal(opcionElegida([sel("tipo", "combo")], "tipo", "simple", "combo"), "pack");
    assert.equal(opcionElegida([sel("tipoProducto", "combo")], "tipoProducto", "simple", "combo"), "pack");
  });
  it("elegir reemplaza lo del campo y respeta los demás filtros", () => {
    const base = [sel("clase", "fisico"), sel("tipo", "simple")];
    assert.deepEqual(conOpcion(base, "tipo", "pack", "simple", "combo"), [sel("clase", "fisico"), sel("tipo", "combo")]);
    assert.deepEqual(conOpcion(base, "tipo", "todos", "simple", "combo"), [sel("clase", "fisico")]);
    assert.deepEqual(conOpcion([], "tipo", "simple", "simple", "combo"), [sel("tipo", "simple")]);
  });
  it("las listas de productos arrancan con solo los simples", () => {
    assert.equal(opcionElegida(FILTRO_SOLO_SIMPLES, "tipo", "simple", "combo"), "simple");
  });
  it("las filas del tipo elegido, para que los tableros cuenten lo que muestra la lista", () => {
    const filas = [{ t: "simple" }, { t: "combo" }, { t: "simple" }];
    const esPack = (f: { t: string }) => f.t === "combo";
    assert.equal(filasDelTipo(filas, "todos", esPack).length, 3);
    assert.equal(filasDelTipo(filas, "simple", esPack).length, 2);
    assert.deepEqual(filasDelTipo(filas, "pack", esPack), [{ t: "combo" }]);
  });
});
