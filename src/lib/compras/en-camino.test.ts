import assert from "node:assert/strict";
import { test } from "node:test";
import { detalleCompuesto, enCaminoDeCompuesto, enCaminoPorPais, faltaParaLlegada, lineaEnCamino, llegadaCorta, llegadaDeCompra, resumenLlegada, type LineaEnCamino } from "./en-camino";

const l = (extra: Partial<LineaEnCamino>): LineaEnCamino => ({ pais: "Panamá", unidades: 100, etapa: "tracking", fechaEnvio: "2026-10-01", fechaLlegada: null, anulada: false, ...extra });

test("en camino: abierta, sin llegar, y ya salió o ya está en producción, tracking o arribo", () => {
  assert.equal(lineaEnCamino(l({})), true);
  assert.equal(lineaEnCamino(l({ fechaEnvio: null })), true); // en tracking sin fecha de envío: ya está pedida
  assert.equal(lineaEnCamino(l({ fechaEnvio: null, etapa: "produccion" })), true); // en producción: viene mercancía, sin fecha de envío todavía
  assert.equal(lineaEnCamino(l({ fechaEnvio: null, etapa: "cotizar" })), false); // solo una cotización
  assert.equal(lineaEnCamino(l({ fechaEnvio: null, etapa: "cotizado" })), false);
  assert.equal(lineaEnCamino(l({ fechaEnvio: null, etapa: "backlog" })), false);
  assert.equal(lineaEnCamino(l({ fechaEnvio: "2026-10-01", etapa: "cotizado" })), true); // aunque la etapa quedara atrás, ya salió
  assert.equal(lineaEnCamino(l({ fechaLlegada: "2026-10-20" })), false); // ya llegó
  assert.equal(lineaEnCamino(l({ etapa: "completado" })), false);
  assert.equal(lineaEnCamino(l({ etapa: "descartado" })), false);
  assert.equal(lineaEnCamino(l({ anulada: true })), false);
});

test("suma las unidades por país, el que más trae primero, y cuenta las compras", () => {
  const r = enCaminoPorPais([l({ unidades: 300 }), l({ unidades: 200, pais: "México" }), l({ unidades: 400, pais: "México" }), l({ unidades: 50, etapa: "arribo_mercancia" }), l({ unidades: 999, fechaEnvio: null, etapa: "cotizado" })]);
  assert.deepEqual(r, [
    { pais: "México", unidades: 600, compras: 2 },
    { pais: "Panamá", unidades: 350, compras: 2 },
  ]);
});

test("sin nada en camino, lista vacía; una línea sin país va a «—»; las cantidades en cero no cuentan", () => {
  assert.deepEqual(enCaminoPorPais([]), []);
  assert.deepEqual(enCaminoPorPais([l({ fechaEnvio: null, etapa: "cotizar" })]), []); // una cotización no viene en camino
  assert.deepEqual(enCaminoPorPais([l({ pais: null, unidades: 10 }), l({ unidades: 0 })]), [{ pais: "—", unidades: 10, compras: 1 }]);
});

test("con un país marcado, solo lo en camino de ese país", () => {
  const lineas = [l({ unidades: 300, codigoPais: "PA" }), l({ unidades: 200, pais: "México", codigoPais: "MX" }), l({ unidades: 100, codigoPais: "PA" })];
  assert.deepEqual(enCaminoPorPais(lineas, "PA"), [{ pais: "Panamá", unidades: 400, compras: 2 }]);
  assert.deepEqual(enCaminoPorPais(lineas, "mx"), [{ pais: "México", unidades: 200, compras: 1 }]);
  assert.deepEqual(enCaminoPorPais(lineas, "CR"), []);
  assert.equal(enCaminoPorPais(lineas).length, 2); // sin país marcado, todos
});

const SIN_HISTORIAL = new Map();

test("la llegada de una compra: su fecha límite, o la estimada con fecha de envío y vía", () => {
  const base = { fechaLimite: null, fechaEnvio: "2026-10-01", vias: ["mar"], clave: "pa" };
  assert.deepEqual(llegadaDeCompra(SIN_HISTORIAL, { ...base, fechaLimite: "2026-11-20" }), { fecha: "2026-11-20", origen: "limite" });
  // Sin fecha límite: fecha de envío + lo típico de la vía (60 días por mar sin envíos anteriores).
  assert.deepEqual(llegadaDeCompra(SIN_HISTORIAL, base), { fecha: "2026-11-30", origen: "estimada" });
});

test("sin fecha límite y sin fecha de envío o sin vía, no hay fecha de llegada", () => {
  assert.equal(llegadaDeCompra(SIN_HISTORIAL, { fechaLimite: null, fechaEnvio: null, vias: ["mar"], clave: "pa" }), null);
  assert.equal(llegadaDeCompra(SIN_HISTORIAL, { fechaLimite: null, fechaEnvio: "2026-10-01", vias: [], clave: "pa" }), null);
  assert.equal(llegadaDeCompra(SIN_HISTORIAL, { fechaLimite: "no es fecha", fechaEnvio: null, vias: [], clave: "pa" }), null);
});

test("el resumen toma la llegada más próxima y cuenta lo que no tiene fecha", () => {
  assert.deepEqual(resumenLlegada([{ unidades: 100, llegada: "2026-12-01" }, { unidades: 50, llegada: "2026-11-05" }, { unidades: 30, llegada: null }]), { unidades: 180, llegada: "2026-11-05", sinFecha: 30, sinEnvio: 0 });
  assert.deepEqual(resumenLlegada([{ unidades: 40, llegada: null }]), { unidades: 40, llegada: null, sinFecha: 40, sinEnvio: 0 });
  assert.deepEqual(resumenLlegada([]), { unidades: 0, llegada: null, sinFecha: 0, sinEnvio: 0 });
  // En producción, sin enviar: las unidades vienen en camino y lo que falta es la fecha de envío.
  assert.deepEqual(resumenLlegada([{ unidades: 500, llegada: null, sinEnvio: true }, { unidades: 20, llegada: null, sinEnvio: false }]), { unidades: 520, llegada: null, sinFecha: 520, sinEnvio: 500 });
  assert.equal(faltaParaLlegada({ fechaEnvio: null }), "envio");
  assert.equal(faltaParaLlegada({ fechaEnvio: "2026-10-01" }), "via");
});

test("un compuesto: lo que viene de sus componentes, con la llegada más próxima y de cuál es", () => {
  const por = new Map([
    ["caps", { unidades: 960, llegada: null, sinFecha: 960, sinEnvio: 0 }],
    ["a", { unidades: 500, llegada: "2026-11-20", sinFecha: 0, sinEnvio: 0 }],
    ["b", { unidades: 300, llegada: "2026-11-12", sinFecha: 100, sinEnvio: 100 }],
  ]);
  const pack = enCaminoDeCompuesto([{ id: "caps", nombre: "Hair Growth capsulas", cantidad: 2 }], por);
  assert.deepEqual([pack.unidades, pack.llegada, pack.sinFecha], [960, null, 960]);
  assert.equal(detalleCompuesto(pack.componentes), "de Hair Growth capsulas · alcanza para 480 packs");
  const combo = enCaminoDeCompuesto([{ id: "a", nombre: "Truly Soft Serve", cantidad: 1 }, { id: "b", nombre: "Truly Buns", cantidad: 1 }], por);
  assert.deepEqual([combo.unidades, combo.llegada, combo.sinFecha, combo.sinEnvio], [800, "2026-11-12", 100, 100]);
  assert.equal(detalleCompuesto(combo.componentes), "500 de Truly Soft Serve y 300 de Truly Buns");
  const soloUno = enCaminoDeCompuesto([{ id: "a", nombre: "Truly Soft Serve", cantidad: 1 }, { id: "x", nombre: "Otro", cantidad: 1 }], por);
  assert.equal(detalleCompuesto(soloUno.componentes), "de Truly Soft Serve");
  assert.equal(detalleCompuesto(enCaminoDeCompuesto([{ id: "x", nombre: "Otro", cantidad: 2 }], por).componentes), null);
});

test("la fecha corta lleva el año solo si no es el actual", () => {
  assert.equal(llegadaCorta("2026-11-05", "2026-10-22"), "5 nov");
  assert.equal(llegadaCorta("2027-01-09", "2026-10-22"), "9 ene 2027");
});
