import assert from "node:assert/strict";
import test from "node:test";
import { cruzarConLibro, semanaDeDescripcion } from "./conciliar-libro";

test("la semana que nombra un pago del libro", () => {
  assert.equal(semanaDeDescripcion("TRANSPORTE 3/9 AL 09/9- REPARTIDOR X - BANCA EN LINEA", "2026-09-01"), "2026-09-03");
  assert.equal(semanaDeDescripcion("transporte 24/9 al 30/9 - X", "2026-10-01"), "2026-09-24");
  assert.equal(semanaDeDescripcion("TRANSPORTE 27/8 AL 02/9- X", "2026-09-01"), "2026-08-27");
  assert.equal(semanaDeDescripcion("TRANSPORTE 31/12 AL 6/1 - X", "2027-01-01"), "2026-12-31");
  assert.equal(semanaDeDescripcion("PAGO DE LUZ", "2026-09-01"), null);
  assert.equal(semanaDeDescripcion("TRANSPORTE 31/2 AL 6/3", "2026-03-01"), null);
});

test("por semana y tienda: cierres contra libro", () => {
  const r = cruzarConLibro(
    [
      { semana: "2026-09-24", tienda: "OFERFY PAN", monto: 105.85 },
      { semana: "2026-09-24", tienda: "OFERFY PAN", monto: 20 },
      { semana: "2026-09-24", tienda: "KENKU", monto: 10 },
      // Semana que el libro todavía no tiene: no se compara.
      { semana: "2026-10-08", tienda: "KENKU", monto: 99 },
    ],
    [
      { periodo: "2026-10-01", tienda: "OFERFY PAN", descripcion: "TRANSPORTE 24/9 AL 30/9 - A", monto: 55.85 },
      { periodo: "2026-10-01", tienda: "OFERFY PAN", descripcion: "TRANSPORTE 24/9 AL 30/9 - B", monto: 20 },
      { periodo: "2026-10-01", tienda: "KENKU", descripcion: "TRANSPORTE 24/9 AL 30/9 - B", monto: 10 },
      // Semana sin datos en Deliverys: no se compara.
      { periodo: "2026-09-01", tienda: "KENKU", descripcion: "TRANSPORTE 27/8 AL 02/9 - B", monto: 7 },
    ],
  );
  assert.deepEqual(r, [
    { semana: "2026-09-24", tienda: "KENKU", deliverys: 10, libro: 10, diferencia: 0, lineasLibro: 1 },
    { semana: "2026-09-24", tienda: "OFERFY PAN", deliverys: 125.85, libro: 75.85, diferencia: -50, lineasLibro: 2 },
  ]);
});
