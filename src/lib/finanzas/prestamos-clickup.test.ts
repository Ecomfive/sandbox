import assert from "node:assert/strict";
import test from "node:test";
import { fechaClickup, leerListaClickup, listaDeArchivo, PARTE } from "./prestamos-clickup";

const CAB = '"Task ID","Task Name","Task Content","Latest Comment","Date Created","Start Date","Inversión (currency)","Porcentaje ROI (number)","Retorno (formula)","Fecha de pago (date)","Prestamo de (drop down)"';
const fila = (...c: string[]) => c.map((x) => `"${x}"`).join(",");

test("fechas y nombre de archivo", () => {
  assert.equal(fechaClickup("Wednesday, November 18th 2026"), "2026-11-18");
  assert.equal(fechaClickup("Tuesday, April 21st 2026, 4:14:55 pm -05:00"), "2026-04-21");
  assert.equal(fechaClickup(""), null);
  assert.equal(listaDeArchivo("x - Financiamientos_Ortoped_Co_SPA.csv"), "ortoped");
  assert.equal(listaDeArchivo("x - Prestamos_A_Costa_Rica_.csv"), "costa_rica");
});

test("Ortoped: préstamo y su costo, Panamá debe", () => {
  const csv = [CAB, fila("t1", "ECOM02-0055", "", "", "Monday, October 5th 2026, 1:00:00 pm -05:00", "", "1733", "20", "2079.6", "Wednesday, November 18th 2026", "")].join("\n");
  const r = leerListaClickup(csv, "ortoped");
  assert.equal(r.movimientos.length, 2);
  assert.deepEqual(r.movimientos.map((m) => [m.tipo, m.monto, m.deudor, m.acreedor, m.vence]), [
    ["prestamo", 1733, PARTE.PA, PARTE.ORTOPED, "2026-11-18"],
    ["costo", 346.6, PARTE.PA, PARTE.ORTOPED, "2026-11-18"],
  ]);
  assert.deepEqual(r.movimientos[0].ordenes, ["ECOM02-0055"]);
});

test("Costa Rica: tarjeta de Alcides, préstamo de México con comisiones y abono, y lo que queda por revisar", () => {
  const mx = "Préstamos \n$10000 Pago Ordenes (27/05/2026) \n$100 Comisión (27/05/2026) \n-$9991 Pago ordenes CR a Mx para abono deuda (21/08/2026)\nResta=$109";
  const csv = [
    CAB,
    fila("a", "ECOM03-0016", "", "", "Tuesday, April 14th 2026, 11:29:43 am -05:00", "", "643", "0", "", "", "Alcides TDC"),
    fila("b", "Préstamo de Ecomfive México Mx", mx, "", "Wednesday, May 27th 2026, 6:42:31 pm -05:00", "", "10000", "", "", "", "Ecomfive México"),
    fila("c", "Deuda CR a PA ", "", "", "Friday, October 2nd 2026", "", "", "", "", "", ""),
    fila("d", "Crédito TDC Alcides", "", "", "Sunday, August 16th 2026", "", "42080.94", "", "", "", "Alcides TDC"),
  ].join("\n");
  const r = leerListaClickup(csv, "costa_rica");
  const a = r.movimientos.find((m) => m.clave === "clickup:a:1")!;
  assert.equal(a.acreedor, PARTE.ALCIDES);
  assert.equal(a.medio, "Tarjeta de Alcides");
  const b = r.movimientos.filter((m) => m.clave.startsWith("clickup:b:"));
  assert.deepEqual(b.map((m) => [m.tipo, m.monto, m.fecha]), [
    ["prestamo", 10000, "2026-05-27"],
    ["costo", 100, "2026-05-27"],
    ["abono", 9991, "2026-08-21"],
  ]);
  assert.deepEqual(r.porRevisar.map((p) => p.tarea), ["c", "d"]);
});
