import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcularPagina } from "./paginacion";
import { leerFilasPorPagina, opcionMarcada, TAMANO_TODAS, tamanoDePagina } from "./filas-por-pagina";

describe("filas por página", () => {
  it("lee solo lo que está en la lista", () => {
    assert.equal(leerFilasPorPagina("100"), 100);
    assert.equal(leerFilasPorPagina("500"), 500);
    assert.equal(leerFilasPorPagina("todas"), "todas");
    assert.equal(leerFilasPorPagina("75"), null);
    assert.equal(leerFilasPorPagina("0"), null);
    assert.equal(leerFilasPorPagina(""), null);
    assert.equal(leerFilasPorPagina(null), null);
    assert.equal(leerFilasPorPagina("<script>"), null);
  });

  it("usa lo elegido y, si no hay elección, el valor de la tabla", () => {
    assert.equal(tamanoDePagina(null, 50), 50);
    assert.equal(tamanoDePagina(500, 50), 500);
    assert.equal(tamanoDePagina("todas", 100), TAMANO_TODAS);
  });

  it("«todas» deja una sola página con todas las filas", () => {
    const p = calcularPagina(1217, tamanoDePagina("todas", 100), 3);
    assert.equal(p.totalPaginas, 1);
    assert.equal(p.pagina, 1);
    assert.equal(p.inicio, 0);
    assert.equal(p.fin, 1217);
  });

  it("500 por página parte 1217 filas en 3 páginas", () => {
    const p = calcularPagina(1217, 500, 3);
    assert.equal(p.totalPaginas, 3);
    assert.equal(p.desde, 1001);
    assert.equal(p.hasta, 1217);
  });

  it("marca en el selector la opción que se está usando", () => {
    assert.equal(opcionMarcada(100), 100);
    assert.equal(opcionMarcada(TAMANO_TODAS), "todas");
    assert.equal(opcionMarcada(60), null);
  });
});
