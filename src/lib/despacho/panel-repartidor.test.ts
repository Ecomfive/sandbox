import assert from "node:assert/strict";
import test from "node:test";
import { diaLargo, diasDeLaSemana, diaVisible, fechasRapidas, inicioSemana, puedeMarcar, formaNormal, nombreRepartidor, resumenCierre, seccionDe, tituloTienda, type FilaPanel } from "./panel-repartidor";

test("pestañas de Mi ruta: recolectado y sin estado van en ruta", () => {
  assert.equal(seccionDe(null), "ruta");
  assert.equal(seccionDe("RECOLECTADO"), "ruta");
  assert.equal(seccionDe("ENTREGADO"), "entregados");
  assert.equal(seccionDe("POSPUESTO"), "no");
  assert.equal(seccionDe("FALLIDO"), "no");
});

test("nombres y grafías", () => {
  assert.equal(nombreRepartidor("YOSELYN    VIAÑA"), nombreRepartidor("Yoselyn Viaña"));
  assert.equal(formaNormal("MiPOS."), "MIPOS");
  assert.equal(tituloTienda("CLICKSI"), "ClickSi");
  assert.equal(tituloTienda("NUVO"), "Nuvo");
  assert.equal(tituloTienda(null), "Sin tienda");
});

const f = (o: Partial<FilaPanel>): FilaPanel => ({ tienda: "NUVO", estado: "ENTREGADO", formaPago: "EFECTIVO", porCobrar: 30, cobrado: 30, costeEnvio: 3.65, comprobantes: 0, ...o });

test("cierre: efectivo y digital por tienda, y el pago de envíos", () => {
  const r = resumenCierre([
    f({}),
    f({ porCobrar: 10.5, cobrado: 10.5 }),
    f({ tienda: "CLICKSI", porCobrar: 20, cobrado: 20 }),
    f({ tienda: "OFERFY", formaPago: "YAPPY", porCobrar: 40, cobrado: null, comprobantes: 1 }),
    f({ tienda: "OFERFY", formaPago: "MiPOS.", porCobrar: 25, cobrado: null, comprobantes: 0 }),
    f({ estado: "FALLIDO", formaPago: null, cobrado: null, comprobantes: 5 }),
    f({ estado: "FALLIDO", formaPago: null, cobrado: null, comprobantes: 0 }),
    f({ estado: "POSPUESTO", formaPago: null, cobrado: null }),
    f({ estado: "RECOLECTADO", formaPago: null, cobrado: null }),
  ]);
  assert.equal(r.pedidos, 9);
  assert.equal(r.enRuta, 1);
  assert.equal(r.entregados, 5);
  assert.equal(r.pospuestos, 1);
  assert.equal(r.fallidos, 2);
  assert.equal(r.fallidosConEvidencia, 1);
  assert.deepEqual(r.efectivo, [
    { tienda: "Nuvo", pedidos: 2, monto: 40.5 },
    { tienda: "ClickSi", pedidos: 1, monto: 20 },
  ]);
  assert.equal(r.efectivoTotal, 60.5);
  assert.deepEqual(r.digitales, [{ tienda: "Oferfy", detalle: "Yappy 1 · MiPOS 1", monto: 65 }]);
  assert.equal(r.digitalesConComprobante, 1);
  assert.equal(r.digitalesPedidos, 2);
  // 5 entregados + 1 fallido con evidencia; el pospuesto, el fallido sin foto y el que sigue en ruta no se pagan.
  assert.deepEqual(r.pago, { pedidos: 6, monto: 21.9, tarifa: 3.65 });
});

test("fechas del panel", () => {
  assert.equal(diaLargo("2026-11-23"), "Lunes 23/11");
  assert.deepEqual(fechasRapidas("2026-11-24"), [
    { iso: "2026-11-25", texto: "Mañana" },
    { iso: "2026-11-26", texto: "Jue 26/11" },
  ]);
});

test("la semana en curso: de lunes a hoy, y se marca hoy y los dos días anteriores", () => {
  assert.equal(inicioSemana("2026-11-24"), "2026-11-23");
  assert.equal(inicioSemana("2026-11-23"), "2026-11-23");
  assert.equal(inicioSemana("2026-11-29"), "2026-11-23");
  assert.deepEqual(
    diasDeLaSemana("2026-11-26").map((d) => [d.iso, d.texto, d.marca]),
    [
      ["2026-11-23", "Lun 23", false],
      ["2026-11-24", "Mar 24", true],
      ["2026-11-25", "Mié 25", true],
      ["2026-11-26", "Hoy", true],
    ],
  );
  // El lunes empieza de nuevo: lo del sábado ya no se ve ni se marca.
  assert.deepEqual(diasDeLaSemana("2026-11-30").map((d) => d.iso), ["2026-11-30"]);
  assert.equal(puedeMarcar("2026-11-28", "2026-11-30"), false);
  assert.equal(diaVisible("2026-11-28", "2026-11-30"), "2026-11-30");
  assert.equal(diaVisible("2026-11-23", "2026-11-26"), "2026-11-23");
  assert.equal(diaVisible("basura", "2026-11-26"), "2026-11-26");
});
