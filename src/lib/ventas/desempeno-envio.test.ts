import test from "node:test";
import assert from "node:assert/strict";
import { desempenoEnvio, csvDesempeno } from "./desempeno-envio";

test("tasa de entrega y días por mensajero", () => {
  const r = desempenoEnvio([
    { fase: "entregada", repartidor: "Ana", transportista: null, fecha: "2026-10-01", entregada_en: "2026-10-03T12:00:00Z" },
    { fase: "fallida", repartidor: "Ana", transportista: null, fecha: "2026-10-01", entregada_en: null },
    { fase: "despachada", repartidor: "Ana", transportista: null, fecha: "2026-10-02", entregada_en: null },
    { fase: "confirmada", repartidor: "Ana", transportista: null, fecha: "2026-10-02", entregada_en: null },
    { fase: "entregada", repartidor: null, transportista: "UPS", fecha: "2026-10-01", entregada_en: "2026-10-02T00:00:00Z" },
  ]);
  const ana = r.find((x) => x.quien === "Ana")!;
  assert.equal(ana.ordenes, 3);
  assert.equal(ana.tasaEntrega, 50);
  assert.equal(ana.diasPromedio, 2.5);
  assert.equal(r.find((x) => x.quien === "UPS")!.tasaEntrega, 100);
});
test("csv con encabezado", () => {
  assert.ok(csvDesempeno([]).includes("% de entrega"));
});
