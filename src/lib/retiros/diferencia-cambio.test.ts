import { test } from "node:test";
import assert from "node:assert/strict";
import { diferenciaPorMes } from "./diferencia-cambio";

test("suma por el mes de la solicitud lo pedido menos lo recibido, del mes más reciente al más viejo", () => {
  const r = diferenciaPorMes([
    { fecha: "2026-07-14", estado: "cerrado", monto: 12000, montoRecibido: 11975 },
    { fecha: "2026-07-15", estado: "cerrado", monto: 8000, montoRecibido: 7980 },
    { fecha: "2026-09-03", estado: "cerrado", monto: 10000, montoRecibido: 9975 },
  ]);
  assert.deepEqual(
    r.map((m) => [m.mes, m.retiros, m.monto, m.recibido, m.diferencia]),
    [
      ["2026-09", 1, 10000, 9975, 25],
      ["2026-07", 2, 20000, 19955, 45],
    ],
  );
});

test("los cancelados y abiertos no cuentan; los cerrados sin lo recibido se avisan aparte", () => {
  const [m] = diferenciaPorMes([
    { fecha: "2026-05-04", estado: "cancelado", monto: 10000, montoRecibido: null },
    { fecha: "2026-05-10", estado: "abierto", monto: 5000, montoRecibido: null },
    { fecha: "2026-05-20", estado: "cerrado", monto: 6035, montoRecibido: 5980 },
    { fecha: "2026-05-21", estado: "cerrado", monto: 3000, montoRecibido: null },
  ]);
  assert.deepEqual(m, { mes: "2026-05", retiros: 1, monto: 6035, recibido: 5980, diferencia: 55, sinRecibido: 1 });
});

test("redondea a centavos", () => {
  const [m] = diferenciaPorMes([
    { fecha: "2026-01-02", estado: "cerrado", monto: 0.1, montoRecibido: 0 },
    { fecha: "2026-01-03", estado: "cerrado", monto: 0.2, montoRecibido: 0 },
  ]);
  assert.equal(m.diferencia, 0.3);
});
