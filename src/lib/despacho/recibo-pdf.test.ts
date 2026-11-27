import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { armarRecibo, reciboPdf } from "./recibo-pdf";

const resumen = {
  porTienda: { NUVO: 80.3, OFERFY: 105.85, KENKU: 43.8 },
  propinas: 5,
  clicksi: 116.8,
  totalOceans: 244.95,
  lineas: [
    { concepto: "entrega" as const, texto: "entregas", cantidad: 95, tarifa: 3.65, total: 346.75 },
    { concepto: "fallido" as const, texto: "fallidos con evidencia", cantidad: 0, tarifa: 3.65, total: 0 },
  ],
};

const base = {
  numero: "ENV-20261119-JULY-CALLE",
  semana: "del 19 al 25 de noviembre de 2026",
  fechaPago: "2026-11-26",
  formaPago: "Transferencia",
  nombreCompleto: "Nombre Completo",
  nombre: "July Calle",
  cedula: "8-000-000",
  resumen,
  firmadoEn: "26/11/2026 10:42",
  codigo: "ABCD1234",
  firma: null,
};

test("el recibo: tiendas de Oceans en orden, propinas, ajustes con su motivo y ClickSi fuera", () => {
  const d = armarRecibo({
    ...base,
    ajustes: [
      { tipo: "propina", monto: 5, motivo: "Propina" },
      { tipo: "ajuste", monto: 10, motivo: "Reconocimiento" },
    ],
  });
  assert.deepEqual(
    d.lineas.map((l) => l.detalle),
    ["Envíos Oferfy", "Envíos Kenku", "Envíos Nuvo", "Propinas", "Reconocimiento"],
  );
  assert.equal(d.fechaPago, "26/11/2026");
  assert.equal(d.explicacion, "95 entregas × $3.65. Lo de ClickSi ($116.80) lo paga ClickSi aparte y no va en este recibo.");
});

test("el PDF del recibo se arma en una página", async () => {
  const bytes = await reciboPdf(armarRecibo({ ...base, nombreCompleto: "Aníbal Pérez", ajustes: [] }));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});
