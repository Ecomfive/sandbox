import assert from "node:assert/strict";
import test from "node:test";
import { cuadreSaldos, leerRespuestaExtracto, pedidoExtracto } from "./extracto-pdf";

const respuesta = (obj: unknown) => ({ content: [{ type: "text", text: "```json\n" + JSON.stringify(obj) + "\n```" }] });

test("lee las líneas con signo, descarta lo ilegible y cuadra con los saldos", () => {
  const r = leerRespuestaExtracto(
    respuesta({
      banco: "Banco General",
      cuenta: "1234",
      saldo_inicial: 1000,
      saldo_final: 1350.5,
      lineas: [
        { fecha: "2026-10-02", descripcion: "Depósito Yappy", referencia: "A1", credito: 500.5, debito: null, saldo: 1500.5 },
        { fecha: "2026-10-03", descripcion: "ACH proveedor", referencia: null, debito: 150, credito: null, saldo: 1350.5 },
        { fecha: "2026-13-40", descripcion: "Mala", credito: 10 },
        { fecha: "2026-10-04", descripcion: "Sin monto" },
      ],
    }),
    "Octubre BG.pdf",
  );
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.hoja.hoja, "Octubre BG");
  assert.equal(r.hoja.formato, "generico");
  assert.deepEqual(r.hoja.lineas.map((l) => l.monto), [500.5, -150]);
  assert.equal(r.hoja.descartadas.length, 2);
  assert.equal(r.diferencia, 0);
  assert.match(r.hoja.lineas[0].huella, /#1$/);
});

test("dos movimientos idénticos el mismo día no comparten huella", () => {
  const l = { fecha: "2026-10-02", descripcion: "Comisión", debito: 1, credito: null };
  const r = leerRespuestaExtracto(respuesta({ lineas: [l, l] }), "x.pdf");
  assert.ok(!("error" in r));
  if (!("error" in r)) assert.notEqual(r.hoja.lineas[0].huella, r.hoja.lineas[1].huella);
});

test("respuesta ilegible o sin movimientos da error; sin saldos no se cuadra", () => {
  assert.ok("error" in leerRespuestaExtracto({ content: [{ type: "text", text: "no sé" }] }, "x.pdf"));
  assert.ok("error" in leerRespuestaExtracto(respuesta({ lineas: [] }), "x.pdf"));
  assert.equal(cuadreSaldos(null, 10, []), null);
  assert.equal(cuadreSaldos(100, 90, [{ monto: -5 }]), 5);
  assert.equal(pedidoExtracto("QUJD").messages[0].content[0].type, "document");
});
