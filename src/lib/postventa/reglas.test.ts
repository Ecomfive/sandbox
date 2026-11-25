import assert from "node:assert/strict";
import test from "node:test";
import { efectosDeEstado, etiquetaDe, ESTADOS, formaPagoDespacho, GRUPO_ABIERTOS, GRUPO_FINANZAS, GRUPO_REALIZADOS, grupoDe, grupoPorEstado, mensajeCliente, nombreSolicitud, reglasDelDia, textoSolicitud, whatsappDe } from "./reglas";

test("cambios: el Estado mueve la solicitud de grupo, como en Monday", () => {
  assert.equal(grupoPorEstado("Hecho"), GRUPO_REALIZADOS);
  assert.equal(grupoPorEstado("Esperando Comprobante de Reembolso"), GRUPO_FINANZAS);
  assert.equal(grupoPorEstado("Pagado Enviar al Cliente"), GRUPO_ABIERTOS);
  assert.equal(grupoPorEstado("En Proceso"), null);
  assert.equal(grupoDe("Asuntos de Finanzas"), GRUPO_FINANZAS);
  assert.equal(grupoDe("Cambios/Retiros/Reembolsos/Complementos"), GRUPO_ABIERTOS);
  assert.equal(etiquetaDe(ESTADOS, "No se retira aprovado por Administracion"), "No se retira aprobado por Administración");
  assert.equal(etiquetaDe(ESTADOS, "hecho"), "Hecho");
});

test("cambios: Hecho avisa, pone Notificar al cliente con la fecha y borra la cuenta", () => {
  const r = efectosDeEstado({ nombre: "Oferfy: realizar reembolso al pedido #148210", tipos: ["reembolso", "retiro"], grupo: GRUPO_FINANZAS }, "Hecho", "2026-11-16");
  assert.equal(r.set.grupo, GRUPO_REALIZADOS);
  assert.equal(r.set.notificar, "Notificar");
  assert.equal(r.set.fecha_notificacion, "2026-11-16");
  assert.equal(r.borrarCuenta, true);
  assert.equal(r.avisos[0].a, "creador");
  assert.match(r.avisos[0].texto, /comprobante/);
  const a = efectosDeEstado({ nombre: "Kenku: complemento #1460", tipos: ["complemento"], grupo: GRUPO_ABIERTOS }, "Asignado", "2026-11-16");
  assert.equal(a.set.grupo, undefined);
  assert.equal(a.avisos[0].a, "responsable");
  assert.equal(a.borrarCuenta, false);
});

test("cambios: reglas de cada mañana", () => {
  const casos = [
    { itemId: "1", nombre: "a", tipos: ["cambio"], estado: "Asignado", fecha: "2026-11-17", notificar: null, fechaNotificacion: null },
    { itemId: "2", nombre: "b", tipos: ["cambio"], estado: "Asignado", fecha: "2026-11-20", notificar: null, fechaNotificacion: null },
    { itemId: "3", nombre: "c", tipos: ["reembolso"], estado: "Hecho", fecha: null, notificar: "Notificar", fechaNotificacion: "2026-11-15" },
    { itemId: "4", nombre: "d", tipos: ["reembolso"], estado: "Hecho", fecha: null, notificar: "Notificar", fechaNotificacion: "2026-11-16" },
  ];
  const r = reglasDelDia(casos, "2026-11-16");
  assert.deepEqual(r.map((x) => [x.itemId, x.set]), [["1", { estado: "Estancado" }], ["3", { notificar: "Estancado" }]]);
});

test("cambios: el nombre y el texto de la solicitud, con el formato de siempre", () => {
  const d = {
    tienda: "NUVO",
    numero: "#44510",
    tipos: ["cambio" as const, "retiro" as const],
    retirar: [{ cantidad: 3, producto: "Antena digital HDTV" }],
    enviar: [{ cantidad: 2, producto: "EnergyBox" }],
    reembolso: null,
    reembolsoComo: null,
    motivo: "El producto no funciona",
    detalle: null,
    costoEnvio: 3.5,
    enviaPaga: "empresa" as const,
  };
  assert.equal(nombreSolicitud(d), "Nuvo: realizar cambio al pedido #44510");
  assert.equal(
    textoSolicitud(d),
    "SOLICITUD DE CAMBIO + RETIRO:\n\nNUVO #44510\n\nRETIRAR: 3 × Antena digital HDTV\nENTREGAR: 2 × EnergyBox\n\nMotivo: El producto no funciona\n\nCosto del envío: $3.50 costeado por la empresa",
  );
  assert.equal(formaPagoDespacho(["complemento"], true), "COMPLEMENTO");
  assert.equal(formaPagoDespacho(["cambio"], true), "CAMBIO");
  assert.equal(formaPagoDespacho(["reembolso", "retiro"], false), "RETIRO");
});

test("cambios: el WhatsApp del cliente y el mensaje con el comprobante", () => {
  assert.equal(whatsappDe("6123-4567"), "50761234567");
  assert.equal(whatsappDe("+507 6123 4567"), "50761234567");
  assert.equal(whatsappDe("123"), null);
  const m = mensajeCliente({ cliente: "Vanesa Velásquez", tienda: "OFERFY", numero: "#1466", tipos: ["reembolso"], reembolso: 32.98, enlace: "https://x/y" });
  assert.match(m, /^Hola Vanesa, te escribimos de Oferfy\./);
  assert.match(m, /reembolso de tu pedido #1466 por \$32\.98\./);
  assert.match(m, /comprobante: https:\/\/x\/y/);
  assert.match(mensajeCliente({ cliente: null, tienda: null, numero: "1916", tipos: ["cambio"], reembolso: null, enlace: null }), /^Hola, te escribimos de la tienda\.\n\nYa hicimos el cambio de tu pedido #1916\./);
});
