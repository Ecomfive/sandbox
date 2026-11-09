import assert from "node:assert/strict";
import test from "node:test";
import { descripcionDeFactura, leerRespuestaFactura, pedidoFactura } from "./factura-ia";

test("el pedido manda el PDF como documento y la foto como imagen", () => {
  const pdf = pedidoFactura({ tipo: "pdf" }, "QUJD");
  assert.equal(pdf.messages[0].content[0].type, "document");
  const foto = pedidoFactura({ tipo: "imagen", mime: "image/png" }, "QUJD", "otro-modelo");
  assert.equal(foto.model, "otro-modelo");
  assert.deepEqual((foto.messages[0].content[0] as { source: { media_type: string } }).source.media_type, "image/png");
});

test("interpreta la respuesta, limpia los campos y valida el RUC", () => {
  const r = leerRespuestaFactura({
    content: [
      {
        type: "text",
        text: '```json\n{"proveedor":"Papelería Ficticia","ruc":"2471893-1-821234","dv":"38","fecha":"2026-09-31","numero":"001-77","subtotal":null,"itbms":"7.00","total":"107.00","moneda":"usd","concepto":"Resmas de papel"}\n```',
      },
    ],
  });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.proveedor, "Papelería Ficticia");
  assert.equal(r.dv, "38");
  assert.equal(r.rucError, null);
  assert.equal(r.fecha, null); // 31 de septiembre no existe
  assert.equal(r.subtotal, 100);
  assert.equal(r.moneda, "USD");
  assert.equal(descripcionDeFactura(r), "Papelería Ficticia · Resmas de papel · Fact. 001-77");
});

test("avisa el DV que no coincide y rechaza lo que no es JSON", () => {
  const r = leerRespuestaFactura({ content: [{ type: "text", text: '{"ruc":"2471893-1-821234","dv":"11","total":5}' }] });
  assert.ok(!("error" in r) && /38/.test(r.rucError ?? ""));
  assert.ok("error" in leerRespuestaFactura({ content: [{ type: "text", text: "no puedo leerla" }] }));
  assert.ok("error" in leerRespuestaFactura(null));
});
