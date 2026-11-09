import assert from "node:assert/strict";
import test from "node:test";
import { indicadoresSalud, mesesSinCerrar, resumenSalud, type EntradaSalud } from "./salud-datos";

const base: EntradaSalud = {
  movimientos: 1000,
  sinTipo: 30,
  sinTienda: 10,
  pendientes: 35,
  lineasBanco: 200,
  lineasResueltas: 190,
  mesesConMovimientos: ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"],
  mesesCerrados: ["2026-07-01"],
  mesActual: "2026-10-01",
  duplicados: 0,
  atipicos: 3,
  sinTasa: 0,
  tablas: [
    { nombre: "Base de reparto", filas: 12, href: "/estado-resultados", accion: "Cargar" },
    { nombre: "Saldos iniciales", filas: 0, href: "/flujo-caja", accion: "Cargar" },
  ],
  importacionesFallidas: null,
};

test("meses sin cerrar: los pasados con movimientos y sin cierre (el mes en curso no cuenta)", () => {
  assert.deepEqual(mesesSinCerrar(base.mesesConMovimientos, base.mesesCerrados, base.mesActual), ["2026-08-01", "2026-09-01"]);
});

test("cada indicador con su estado y su enlace", () => {
  const xs = indicadoresSalud(base);
  const por = Object.fromEntries(xs.map((x) => [x.id, x]));
  assert.equal(por.clasificado.valor, "96.5 %");
  assert.equal(por.clasificado.estado, "atencion");
  assert.equal(por.conciliado.valor, "95 %");
  assert.equal(por.conciliado.estado, "bien");
  assert.equal(por.cierres.valor, "2");
  assert.equal(por.cierres.estado, "problema");
  assert.equal(por.duplicados.estado, "bien");
  assert.equal(por.tablas.detalle, "Saldos iniciales");
  assert.equal(por.tablas.href, "/flujo-caja");
  assert.equal(por.importaciones, undefined); // sin la migración no se muestra
  assert.deepEqual(resumenSalud(xs), { bien: 3, total: 7, problemas: 1 });
});
