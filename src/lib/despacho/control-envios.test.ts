import assert from "node:assert/strict";
import test from "node:test";
import {
  ajustesGuardados,
  conceptoDeFila,
  fechaPagoDe,
  finSemanaPago,
  inicioSemanaPago,
  leerAjuste,
  numeroRecibo,
  resumenSemana,
  semanaEnLetras,
  totalesSemana,
  type FilaEnvio,
} from "./control-envios";

test("la semana de pago va de jueves a miércoles y se paga el jueves siguiente", () => {
  assert.equal(inicioSemanaPago("2026-11-19"), "2026-11-19"); // jueves
  assert.equal(inicioSemanaPago("2026-11-25"), "2026-11-19"); // miércoles
  assert.equal(inicioSemanaPago("2026-11-23"), "2026-11-19"); // lunes
  assert.equal(inicioSemanaPago("2026-11-26"), "2026-11-26");
  assert.equal(finSemanaPago("2026-11-19"), "2026-11-25");
  assert.equal(fechaPagoDe("2026-11-19"), "2026-11-26");
  assert.equal(semanaEnLetras("2026-11-19"), "del 19 al 25 de noviembre de 2026");
  assert.equal(semanaEnLetras("2026-11-26"), "del 26 de noviembre al 2 de diciembre de 2026");
  assert.equal(semanaEnLetras("2026-12-31"), "del 31 de diciembre de 2026 al 6 de enero de 2027");
});

const f = (o: Partial<FilaEnvio>): FilaEnvio => ({ courier: "JULY CALLE", tienda: "OFERFY", estado: "ENTREGADO", formaPago: "EFECTIVO", comprobantes: 0, dia: "2026-11-19", ...o });

test("qué se paga: entregas, fallidos con evidencia, cambios, complementos y retiros; no pospuestos, fallidos sin foto ni lo que sigue en ruta", () => {
  assert.equal(conceptoDeFila(f({})), "entrega");
  assert.equal(conceptoDeFila(f({ estado: "POSPUESTO" })), null);
  assert.equal(conceptoDeFila(f({ estado: "RECOLECTADO" })), null);
  assert.equal(conceptoDeFila(f({ estado: "FALLIDO" })), null);
  assert.equal(conceptoDeFila(f({ estado: "FALLIDO", comprobantes: 2 })), "fallido");
  assert.equal(conceptoDeFila(f({ formaPago: "CAMBIO" })), "cambio");
  assert.equal(conceptoDeFila(f({ formaPago: "COMPLEMENTO" })), "cambio");
  assert.equal(conceptoDeFila(f({ formaPago: "RETIRO" })), "retiro");
  assert.equal(conceptoDeFila(f({ formaPago: "MiPOS." })), "entrega");
});

test("resumen de la semana: tarifas de cada delivery, sus tableros juntos, tiendas de Oceans, ClickSi aparte, propinas y ajustes", () => {
  const filas = [
    f({}),
    f({ tienda: "KENKU", dia: "2026-11-20" }),
    f({ tienda: "CLICKSI" }),
    f({ formaPago: "CAMBIO", dia: "2026-11-21" }),
    f({ formaPago: "RETIRO", tienda: "NUVO", dia: "2026-11-21" }),
    f({ estado: "FALLIDO", comprobantes: 1, dia: "2026-11-21" }),
    f({ estado: "FALLIDO", dia: "2026-11-21" }),
    f({ estado: "POSPUESTO" }),
    f({ estado: "RECOLECTADO" }),
    f({ courier: "DEIMIBEL CIUDAD" }),
    f({ courier: "DEIMIBEL  ZONA 5", tienda: "NUVO", formaPago: "COMPLEMENTO" }),
    f({ courier: "GILBERTO PARRA" }),
    f({ courier: "USUARIO DE PRUEBA" }),
  ];
  const r = resumenSemana(
    filas,
    [
      { id: "j", nombre: "July Calle", couriers: ["JULY CALLE"], tarifas: { entrega: 3.65, cambio: 2 } },
      { id: "d", nombre: "Deimibel Ávila", couriers: ["DEIMIBEL CIUDAD", "DEIMIBEL ZONA 5"], tarifas: { entrega: 5, cambio: 2.5 } },
      { id: "a", nombre: "Andrés Álvarez", couriers: ["ANDRÉS ÁLVAREZ"], tarifas: { entrega: 3.65, cambio: 2 } },
      { id: "p", nombre: "Usuario de prueba", couriers: ["USUARIO DE PRUEBA"], tarifas: { entrega: 3.65, cambio: 2 } },
    ],
    (id) =>
      id === "j"
        ? [
            { tipo: "propina", monto: 5, motivo: "Propina" },
            { tipo: "ajuste", monto: 15, motivo: "Reconocimiento" },
            { tipo: "ajuste", monto: -5, motivo: "Préstamo" },
          ]
        : [],
  );
  const july = r.find((x) => x.deliveryId === "j")!;
  assert.equal(july.asignados, 9);
  assert.equal(july.entregados, 3);
  assert.equal(july.cambios, 1);
  assert.equal(july.retiros, 1);
  assert.equal(july.fallidos, 1);
  assert.equal(july.fallidosSinEvidencia, 1);
  assert.equal(july.pospuestos, 1);
  assert.equal(july.enRuta, 1);
  // Oferfy: entrega 3.65 + cambio 2 + fallido 3.65; Kenku 3.65; Nuvo: retiro 2; ClickSi 3.65 aparte.
  assert.deepEqual(july.porTienda, { OFERFY: 9.3, KENKU: 3.65, NUVO: 2 });
  assert.equal(july.clicksi, 3.65);
  assert.equal(july.propinas, 5);
  assert.equal(july.ajustes, 10);
  assert.equal(july.totalOceans, 29.95);
  assert.deepEqual(
    july.dias.map((d) => [d.dia, d.asignados, d.entregados, d.cambios, d.fallidos, d.retiros, d.pago]),
    [
      ["2026-11-19", 4, 2, 0, 0, 0, 7.3],
      ["2026-11-20", 1, 1, 0, 0, 0, 3.65],
      ["2026-11-21", 4, 0, 1, 1, 1, 7.65],
    ],
  );
  assert.deepEqual(
    july.lineas.map((l) => [l.texto, l.cantidad, l.total]),
    [
      ["entregas", 3, 10.95],
      ["fallido con evidencia", 1, 3.65],
      ["cambio o complemento", 1, 2],
      ["retiro", 1, 2],
    ],
  );
  const deimibel = r.find((x) => x.deliveryId === "d")!;
  assert.equal(deimibel.entregados, 1);
  assert.equal(deimibel.cambios, 1);
  assert.equal(deimibel.totalOceans, 7.5);
  // Un delivery registrado sin pedidos igual sale (para anotarle propinas); uno sin registrar sale aparte, con las tarifas de siempre.
  assert.equal(r.find((x) => x.deliveryId === "a")!.asignados, 0);
  const suelto = r.find((x) => x.deliveryId === null)!;
  assert.equal(suelto.nombre, "GILBERTO PARRA");
  assert.equal(suelto.totalOceans, 3.65);
  // El de prueba va al final y no suma en los totales.
  assert.equal(r.at(-1)!.deliveryId, "p");
  const t = totalesSemana(r);
  assert.equal(t.totalOceans, 29.95 + 7.5 + 3.65);
  assert.equal(t.clicksi, 3.65);
  assert.equal(t.entregados, 3 + 1 + 1);
});

test("propinas y ajustes escritos a mano", () => {
  assert.deepEqual(leerAjuste("ajuste", "-50", "Descuento del préstamo"), { tipo: "ajuste", monto: -50, motivo: "Descuento del préstamo" });
  assert.deepEqual(leerAjuste("ajuste", "$15,5", "Reconocimiento por venta"), { tipo: "ajuste", monto: 15.5, motivo: "Reconocimiento por venta" });
  assert.deepEqual(leerAjuste("propina", "3", ""), { tipo: "propina", monto: 3, motivo: "Propina" });
  assert.equal(leerAjuste("propina", "-3", "x"), null);
  assert.equal(leerAjuste("ajuste", "0", "Nada"), null);
  assert.equal(leerAjuste("ajuste", "10", ""), null);
  assert.equal(leerAjuste("otro", "10", "x"), null);
  assert.deepEqual(ajustesGuardados([{ tipo: "propina", monto: 2, motivo: "Propina" }, { monto: 1, motivo: "Viejo sin tipo" }, null, "x"]), [
    { tipo: "propina", monto: 2, motivo: "Propina" },
    { tipo: "ajuste", monto: 1, motivo: "Viejo sin tipo" },
  ]);
});

test("número del recibo", () => {
  assert.equal(numeroRecibo("2026-11-19", "Aníbal Pérez"), "ENV-20261119-ANIBAL-PEREZ");
});
