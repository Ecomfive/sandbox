import test from "node:test";
import assert from "node:assert/strict";
import { csvEstancadas, diasDesde, reporteEstancadas } from "./reporte-estancadas";

const ahora = new Date("2026-11-10T12:00:00Z");

test("diasDesde cuenta días completos y tolera fechas malas", () => {
  assert.equal(diasDesde("2026-11-06T12:00:00Z", ahora), 4);
  assert.equal(diasDesde("basura", ahora), 0);
});

test("reporteEstancadas deja solo las que pasan el umbral, de más a menos", () => {
  const f = reporteEstancadas(
    [
      { id: "a", numero: "#1001", fase: "despachada", desde: "2026-11-05T12:00:00Z" },
      { id: "b", numero: "#1002", fase: "confirmada", desde: "2026-11-09T12:00:00Z" },
      { id: "c", numero: "#1003", fase: "fallida", desde: "2026-11-01T12:00:00Z" },
      { id: "d", numero: "#1004", fase: "entregada", desde: "2026-10-01T12:00:00Z" },
    ],
    ahora,
  );
  assert.deepEqual(f.map((x) => x.numero), ["#1003", "#1001"]);
  assert.equal(f[0].dias, 9);
});

test("csvEstancadas lleva BOM, CRLF y protege fórmulas", () => {
  const c = csvEstancadas([{ numero: "=1+1", fase: "fallida", dias: 5 }]);
  assert.ok(c.startsWith("﻿Orden,Fase,Días en la fase\r\n"));
  assert.ok(!c.includes("\r\n=1+1"));
});
