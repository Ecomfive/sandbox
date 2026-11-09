import assert from "node:assert/strict";
import test from "node:test";
import {
  cierreDeTotales,
  descripcionLibro,
  esInicioSemana,
  finSemana,
  inicioSemana,
  liquidar,
  repartirEnTiendas,
  sentidoNeto,
  tarifaDe,
  textoSemana,
  textoSemanaCorto,
  validarTarifas,
  type LineaLiquidacion,
} from "./liquidacion";

// Datos inventados.
const l = (p: Partial<LineaLiquidacion> & Pick<LineaLiquidacion, "tienda">): LineaLiquidacion => ({
  estado: "entregado",
  categoria: "entrega",
  cantidad: 1,
  tarifa: 3.65,
  pagoAparte: false,
  ...p,
});

test("la semana de cierre va de jueves a miércoles", () => {
  assert.equal(inicioSemana("2026-10-08"), "2026-10-08"); // jueves
  assert.equal(inicioSemana("2026-10-12"), "2026-10-08"); // lunes
  assert.equal(inicioSemana("2026-10-14"), "2026-10-08"); // miércoles
  assert.equal(inicioSemana("2026-10-15"), "2026-10-15");
  assert.equal(inicioSemana("2027-01-02"), "2026-12-31"); // cruza de año
  assert.equal(finSemana("2026-10-08"), "2026-10-14");
  assert.ok(esInicioSemana("2026-10-08"));
  assert.ok(!esInicioSemana("2026-10-09"));
  assert.ok(!esInicioSemana("08/10/2026"));
});

test("texto del período, como en el recibo", () => {
  assert.equal(textoSemana("2026-10-08"), "8 al 14 de octubre de 2026");
  assert.equal(textoSemana("2026-10-29"), "29 de octubre al 4 de noviembre de 2026");
  assert.equal(textoSemana("2026-12-31"), "31 de diciembre de 2026 al 6 de enero de 2027");
  assert.equal(textoSemanaCorto("2026-10-08"), "08/10 – 14/10");
});

test("una fila de la hoja: cada tienda por su tarifa, el fallido se paga y el devuelto no", () => {
  // 4 + 4 + 2 entregas a $3.65 = $36.50, como «CÁLCULO TOTAL A PAGAR» de una fila con esos números.
  const r = liquidar([
    l({ tienda: "NUVO PAN", cantidad: 4 }),
    l({ tienda: "OFERFY PAN", cantidad: 4 }),
    l({ tienda: "KENKU", cantidad: 2 }),
    l({ tienda: "OFERFY PAN", estado: "fallido", cantidad: 1 }),
    l({ tienda: "OFERFY PAN", estado: "devuelto", categoria: null, cantidad: 3, tarifa: 0 }),
  ]);
  assert.equal(r.enRuta, 14);
  assert.equal(r.entregas, 10);
  assert.equal(r.fallidas, 1);
  assert.equal(r.devueltas, 3);
  assert.equal(r.tarifas, 40.15);
  assert.equal(r.aPagar, 40.15);
  assert.equal(r.neto, 40.15);
  assert.equal(r.tasaEntrega, 10 / 14);
  const oferfy = r.porTienda.find((t) => t.tienda === "OFERFY PAN")!;
  assert.equal(oferfy.total, 18.25);
  assert.equal(oferfy.devueltas, 3);
});

test("tarifas de la hoja: compartida, cambios, fuera de ruta y la de $5", () => {
  const r = liquidar([
    l({ tienda: "KENKU", categoria: "compartida", tarifa: 1.83, cantidad: 3 }),
    l({ tienda: "KENKU", categoria: "cambio", tarifa: 2, cantidad: 2 }),
    l({ tienda: "KENKU", categoria: "cambio", tarifa: 2.5, cantidad: 1 }),
    l({ tienda: "KENKU", categoria: "fuera_ruta", tarifa: 4, cantidad: 1 }),
    l({ tienda: "KENKU", tarifa: 5, cantidad: 2 }),
  ]);
  assert.equal(r.tarifas, 25.99); // 5.49 + 4 + 2.50 + 4 + 10
});

test("propinas suman al pago pero no son entregas; lo de Clicksi va aparte", () => {
  const r = liquidar([
    l({ tienda: "NUVO PAN", cantidad: 2 }),
    l({ tienda: "NUVO PAN", categoria: "propina", cantidad: 1, tarifa: 1.5 }),
    l({ tienda: "CLICKSI", pagoAparte: true, cantidad: 3 }),
    l({ tienda: "CLICKSI", pagoAparte: true, categoria: "propina", tarifa: 1 }),
  ]);
  assert.equal(r.enRuta, 5);
  assert.equal(r.entregas, 5);
  assert.equal(r.tarifas, 7.3);
  assert.equal(r.propinas, 1.5);
  assert.equal(r.aparte, 11.95);
  assert.equal(r.aPagar, 8.8);
  assert.deepEqual(
    r.porTienda.map((t) => [t.tienda, t.total]),
    [
      ["NUVO PAN", 8.8],
      ["CLICKSI", 11.95],
    ],
  );
});

test("neto: a pagar menos adelantos, descuentos y efectivo cobrado", () => {
  const lineas = [
    l({ tienda: "OFERFY PAN", cantidad: 10 }), // 36.50
    l({ tienda: "OFERFY PAN", cobrado: 25, metodo: "efectivo" }), // 3.65
    l({ tienda: "KENKU", cobrado: 40, metodo: "yappy" }), // 3.65, cobro que no queda en manos del repartidor
  ];
  const r = liquidar(lineas, { adelantos: 10, descuentos: 2.5 });
  assert.equal(r.aPagar, 43.8);
  assert.equal(r.cobradoEfectivo, 25);
  assert.equal(r.cobradoOtros, 40);
  assert.equal(r.neto, 6.3);
  assert.equal(sentidoNeto(r.neto), "pagar");
  const debe = liquidar([l({ tienda: "KENKU", cobrado: 80, metodo: "efectivo" })]);
  assert.equal(debe.neto, -76.35);
  assert.equal(sentidoNeto(debe.neto), "rendir");
  assert.equal(sentidoNeto(0), "cero");
  // Ajustes negativos no suman.
  assert.equal(liquidar(lineas, { adelantos: -5, descuentos: 0 }).neto, 18.8);
});

test("la fórmula es la misma desde la vista (totales) y desde las líneas", () => {
  const lineas = [
    l({ tienda: "OFERFY PAN", cantidad: 7 }),
    l({ tienda: "NUVO PAN", estado: "fallido", cantidad: 2 }),
    l({ tienda: "NUVO PAN", categoria: "propina", tarifa: 0.6 }),
    l({ tienda: "CLICKSI", pagoAparte: true, cantidad: 4 }),
    l({ tienda: "KENKU", estado: "devuelto", categoria: null, tarifa: 0, cantidad: 5 }),
    l({ tienda: "KENKU", cobrado: 12.5, metodo: "efectivo" }),
  ];
  const ajustes = { adelantos: 5, descuentos: 1 };
  const a = liquidar(lineas, ajustes);
  const b = cierreDeTotales(
    { enRuta: a.enRuta, entregas: a.entregas, fallidas: a.fallidas, devueltas: a.devueltas, reprogramadas: a.reprogramadas, tarifas: a.tarifas, propinas: a.propinas, aparte: a.aparte, cobradoEfectivo: a.cobradoEfectivo },
    ajustes,
  );
  for (const k of Object.keys(b) as (keyof typeof b)[]) assert.equal(b[k], a[k], k);
});

test("sin pedidos no hay tasa de entrega", () => {
  const r = liquidar([]);
  assert.equal(r.tasaEntrega, null);
  assert.equal(r.neto, 0);
});

test("tarifas propias de un repartidor", () => {
  assert.equal(tarifaDe("entrega", null), 3.65);
  assert.equal(tarifaDe("entrega", { entrega: 4.25 }), 4.25);
  assert.equal(tarifaDe("compartida", { entrega: 4.25 }), 1.83);
  assert.deepEqual(validarTarifas({ entrega: 4.255, propina: 3, cambio: -1, fuera_ruta: "4" }), { entrega: 4.26 });
  assert.equal(validarTarifas({}), null);
  assert.equal(validarTarifas([1]), null);
});

test("lo pagado se reparte por tienda para el libro y suma exacto", () => {
  const porTienda = [
    { tienda: "OFERFY PAN", pagoAparte: false, total: 105.85 },
    { tienda: "KENKU", pagoAparte: false, total: 33.33 },
    { tienda: "CLICKSI", pagoAparte: true, total: 40 },
  ];
  // Un descuento de $50: el neto (89.18) se reparte en proporción.
  const r = repartirEnTiendas(porTienda, 89.18);
  assert.equal(r.length, 2);
  assert.equal(Math.round(r.reduce((a, x) => a + x.monto, 0) * 100) / 100, 89.18);
  assert.ok(r.every((x) => x.tienda !== "CLICKSI"));
  assert.deepEqual(repartirEnTiendas(porTienda, 139.18), [
    { tienda: "OFERFY PAN", monto: 105.85 },
    { tienda: "KENKU", monto: 33.33 },
  ]);
  assert.deepEqual(repartirEnTiendas(porTienda, 0), []);
  assert.deepEqual(repartirEnTiendas([], 10), []);
});

test("descripción del movimiento del libro", () => {
  assert.equal(descripcionLibro("2026-10-08", "REPARTIDOR DE PRUEBA"), "TRANSPORTE 8/10 AL 14/10 - REPARTIDOR DE PRUEBA");
  assert.equal(descripcionLibro("2026-09-24", "X"), "TRANSPORTE 24/9 AL 30/9 - X");
});
