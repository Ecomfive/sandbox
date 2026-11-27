import test from "node:test";
import assert from "node:assert/strict";
import { alcanceInventario, aumentoDeConteo, bloqueoDeBodega, esBodegaDeDespacho, estaACargoDelInventario, faltanteDeCompras, repartirFaltante, revisarLimite, SOLO_A_CARGO, SOLO_BODEGA_DESPACHO } from "./inventario";

const persona = (modulos: string[], soloLectura: string[] = []) => ({ modulos, modulosSoloLectura: soloLectura });

test("un administrador tiene todo el inventario", () => {
  const u = persona(["usuarios", "inventario"]);
  assert.equal(alcanceInventario(u), "total");
  assert.equal(estaACargoDelInventario(u), true);
});

test("quien está a cargo y modifica Inventario tiene todo", () => {
  const u = persona(["inventario", "encargado-inventario"]);
  assert.equal(alcanceInventario(u), "total");
  assert.equal(estaACargoDelInventario(u), true);
});

test("modificar Inventario sin estar a cargo deja solo despacho", () => {
  const u = persona(["inventario"]);
  assert.equal(alcanceInventario(u), "despacho");
  assert.equal(estaACargoDelInventario(u), false);
});

test("con solo lectura no se modifica nada, aunque esté a cargo", () => {
  assert.equal(alcanceInventario(persona(["inventario"], ["inventario"])), "lectura");
  assert.equal(alcanceInventario(persona(["inventario", "encargado-inventario"], ["inventario"])), "lectura");
  assert.equal(alcanceInventario(persona([])), "lectura");
  // Ver Usuarios y roles no es administrar.
  assert.equal(alcanceInventario(persona(["usuarios", "inventario"], ["usuarios"])), "despacho");
});

test("el módulo de encargado en solo lectura no cuenta", () => {
  const u = persona(["inventario", "encargado-inventario"], ["encargado-inventario"]);
  assert.equal(alcanceInventario(u), "despacho");
});

const despacho = { codigo: "despacho", tipo: "propia", pais: "PA" };

test("la bodega de despacho es la propia de Panamá con ese código", () => {
  assert.equal(esBodegaDeDespacho(despacho), true);
  assert.equal(esBodegaDeDespacho({ ...despacho, pais: "CR" }), false);
  assert.equal(esBodegaDeDespacho({ ...despacho, tipo: "externa" }), false);
  assert.equal(esBodegaDeDespacho({ ...despacho, codigo: "oficina_ancon" }), false);
});

test("quién puede mover cada bodega", () => {
  const otra = { codigo: "istorage", tipo: "propia", pais: "PA" };
  assert.equal(bloqueoDeBodega("total", otra), null);
  assert.equal(bloqueoDeBodega("despacho", despacho), null);
  assert.equal(bloqueoDeBodega("despacho", otra), SOLO_BODEGA_DESPACHO);
  assert.equal(bloqueoDeBodega("lectura", despacho), SOLO_A_CARGO);
});

test("bajar o dejar igual es libre", () => {
  assert.equal(revisarLimite({ pais: "PA", existencia: 300, aumento: -10, aCargo: false, motivo: null }), null);
  assert.equal(revisarLimite({ pais: "PA", existencia: 300, aumento: 0, aCargo: false, motivo: null }), null);
});

test("subir sin estar a cargo se rechaza con la existencia, aunque escriba motivo", () => {
  const m = revisarLimite({ pais: "PA", existencia: 300, aumento: 1, aCargo: false, motivo: "encontré una caja" });
  assert.match(m ?? "", /La existencia de este producto es de 300 unidades, estás superando el límite/);
  assert.match(m ?? "", /Recepción/);
});

test("quien está a cargo puede subir escribiendo el motivo", () => {
  const sin = revisarLimite({ pais: "PA", existencia: 1, aumento: 5, aCargo: true, motivo: "  ", dondeVaElMotivo: "en «Referencia»", producto: "CODIGO/A" });
  assert.match(sin ?? "", /^CODIGO\/A: La existencia de este producto es de 1 unidad,/);
  assert.match(sin ?? "", /escribe el motivo en «Referencia»\./);
  assert.equal(revisarLimite({ pais: "PA", existencia: 1, aumento: 5, aCargo: true, motivo: "Conteo físico" }), null);
});

test("fuera de Panamá no hay límite", () => {
  assert.equal(revisarLimite({ pais: "CR", existencia: 10, aumento: 5, aCargo: false, motivo: null }), null);
  assert.equal(revisarLimite({ pais: null, existencia: 10, aumento: 5, aCargo: false, motivo: null }), null);
});

test("cuánto sube un levantamiento", () => {
  assert.equal(aumentoDeConteo({ enBodega: 100, contado: 120, sumar: 0 }), 20);
  assert.equal(aumentoDeConteo({ enBodega: 100, contado: 80, sumar: 0 }), -20);
  assert.equal(aumentoDeConteo({ enBodega: 100, contado: null, sumar: 5 }), 5);
  assert.equal(aumentoDeConteo({ enBodega: 100, contado: null, sumar: 0 }), 0);
  assert.equal(aumentoDeConteo({ enBodega: 100, contado: 90, sumar: 10 }), 0);
  assert.equal(aumentoDeConteo({ enBodega: -5, contado: 0, sumar: 0 }), 5);
});

test("lo que faltó al recibir la orden de compra se suma sin motivo", () => {
  // Se pidieron 600, se recibieron 599: la que faltaba entra sin motivo, aunque no esté a cargo.
  assert.equal(revisarLimite({ pais: "PA", existencia: 599, aumento: 1, aCargo: false, motivo: null, margen: 1 }), null);
  // Más de lo que faltó sigue pidiendo motivo, y lo dice.
  const m = revisarLimite({ pais: "PA", existencia: 599, aumento: 3, aCargo: true, motivo: "", margen: 1, dondeVaElMotivo: "en «Referencia»" });
  assert.match(m ?? "", /De la orden de compra faltaron 1 al recibir: esa se suma sin motivo; lo demás no\./);
  assert.match(m ?? "", /escribe el motivo en «Referencia»/);
  assert.equal(revisarLimite({ pais: "PA", existencia: 599, aumento: 3, aCargo: true, motivo: "Conteo", margen: 1 }), null);
});

test("cuánto faltó de las compras y cómo se completa", () => {
  const lineas = [
    { item: "a", compra: "C-1", pedida: 600, recibida: 599, notas: null },
    { item: "b", compra: "C-2", pedida: 100, recibida: 90, notas: "rotas" },
    { item: "c", compra: "C-3", pedida: 50, recibida: 50, notas: null },
  ];
  assert.equal(faltanteDeCompras(lineas), 11);
  assert.deepEqual(repartirFaltante(lineas, 5), [
    { item: "a", compra: "C-1", antes: 599, despues: 600, suma: 1, notas: null },
    { item: "b", compra: "C-2", antes: 90, despues: 94, suma: 4, notas: "rotas" },
  ]);
  // Nunca pasa lo pedido.
  assert.equal(repartirFaltante(lineas, 50).reduce((t, x) => t + x.suma, 0), 11);
  assert.deepEqual(repartirFaltante(lineas, 0), []);
});
