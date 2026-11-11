import assert from "node:assert/strict";
import test from "node:test";
import { claveDeRuta, conTiendaExplicita, conTiendaGlobal, TODAS_TIENDAS, valorExplicito, valorTiendaValido } from "./tienda-elegida";

const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const OTRO = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";

test("la dirección manda; sin tienda en la dirección, la global; sin global, todas", () => {
  assert.equal(conTiendaGlobal({ ver: OTRO }, "ver", ID).ver, OTRO);
  assert.equal(conTiendaGlobal({ ver: TODAS_TIENDAS }, "ver", ID).ver, TODAS_TIENDAS);
  assert.equal(conTiendaGlobal({ mes: "2026-09-01" }, "ver", ID).ver, ID);
  assert.equal(conTiendaGlobal({ mes: "2026-09-01" }, "tienda", null).tienda, TODAS_TIENDAS);
  // Los demás parámetros se conservan.
  assert.equal(conTiendaGlobal({ mes: "2026-09-01" }, "tienda", ID).mes, "2026-09-01");
  // Un valor vacío es como no traerlo.
  assert.equal(conTiendaGlobal({ tienda: "" }, "tienda", ID).tienda, ID);
});

test("valor explícito: el primero si viene repetido, null si no viene", () => {
  assert.equal(valorExplicito({ ver: [ID, OTRO] }, "ver"), ID);
  assert.equal(valorExplicito({}, "ver"), null);
  assert.equal(valorExplicito({ ver: "" }, "ver"), null);
});

test("solo se guarda «todas» o algo con forma de id", () => {
  assert.ok(valorTiendaValido(TODAS_TIENDAS));
  assert.ok(valorTiendaValido(ID));
  assert.ok(!valorTiendaValido("NUVO"));
  assert.ok(!valorTiendaValido(`${ID}; path=/`));
  assert.ok(!valorTiendaValido(null));
});

test("los enlaces llevan la tienda explícita, también «todas»", () => {
  assert.equal(conTiendaExplicita("/ventas-tiendas", "tienda", TODAS_TIENDAS), "/ventas-tiendas?tienda=todas");
  assert.equal(conTiendaExplicita("/ventas-tiendas?mes=2026-09-01", "tienda", ID), `/ventas-tiendas?mes=2026-09-01&tienda=${ID}`);
  assert.equal(conTiendaExplicita(`/x?tienda=${OTRO}`, "tienda", ID), `/x?tienda=${ID}`);
});

test("la barra solo ofrece la tienda en las páginas que la usan", () => {
  assert.equal(claveDeRuta("/estado-resultados"), "ver");
  assert.equal(claveDeRuta("/estado-resultados/ajustes"), null);
  assert.equal(claveDeRuta("/rentabilidad"), "tienda");
  assert.equal(claveDeRuta("/rentabilidad/palancas"), "tienda");
  assert.equal(claveDeRuta("/rentabilidad/capital-trabajo"), null);
  assert.equal(claveDeRuta("/ventas-tiendas/ordenes"), "tienda");
  assert.equal(claveDeRuta("/ventas-tiendas/cuadre"), null);
  assert.equal(claveDeRuta(`/presupuesto/${ID}`), "ver");
  assert.equal(claveDeRuta("/presupuesto"), null);
  assert.equal(claveDeRuta("/retiros"), null);
});
