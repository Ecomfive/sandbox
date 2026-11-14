import assert from "node:assert/strict";
import test from "node:test";
import { grupoDeEstadoGuia, leerLecturaSiscore, momentoEntrega, pedidoDeFactura, tiendaDeClienteSiscore, visitasSinEntregar } from "./siscore";

test("estados de SISCORE (los que se vieron en la cuenta de Kenku)", () => {
  assert.equal(grupoDeEstadoGuia("Entrega App"), "entregado");
  assert.equal(grupoDeEstadoGuia("ENTREGADO"), "entregado");
  assert.equal(grupoDeEstadoGuia("Ingreso a CPL por Devolucion"), "devuelto");
  assert.equal(grupoDeEstadoGuia("Cancelado por devolución · TRA"), "devuelto");
  assert.equal(grupoDeEstadoGuia("CLIENTE NO LOCALIZADO"), "novedad");
  assert.equal(grupoDeEstadoGuia("TELEFONO INCORRECTO O APAGADO"), "novedad");
  assert.equal(grupoDeEstadoGuia("NO HAY QUIEN RECIBA EN DOMICILIO"), "novedad");
  assert.equal(grupoDeEstadoGuia("NO ASIGNADO A RUTA POR PROGRAMACION CON"), "novedad");
  assert.equal(grupoDeEstadoGuia("Inventario CPL PANAMA"), "en_ruta");
  assert.equal(grupoDeEstadoGuia("Saliendo de CPL COLON a CPL PANAMA"), "en_ruta");
  assert.equal(grupoDeEstadoGuia("Contacto por WhatsApp"), "en_ruta");
  assert.equal(grupoDeEstadoGuia(null), "en_ruta");
});

test("visitas sin entregar, entrega y número de pedido", () => {
  const h = [
    { estado: "Recolectado", fecha: "2026-11-11", hora: "11:32:06" },
    { estado: "Asignado a Ruta", fecha: "2026-11-12", hora: "05:21:54" },
    { estado: "CLIENTE NO LOCALIZADO", fecha: "2026-11-12", hora: "11:28:31" },
    { estado: "TELEFONO INCORRECTO O APAGADO", fecha: "2026-11-13", hora: "10:00:00" },
    { estado: "Entrega App", fecha: "2026-11-14", hora: "09:15:00" },
  ];
  assert.deepEqual(visitasSinEntregar(h), { visitas: 2, motivo: "TELEFONO INCORRECTO O APAGADO" });
  assert.equal(momentoEntrega(h), "2026-11-14 09:15:00");
  assert.equal(momentoEntrega(h.slice(0, 3)), null);
  assert.equal(pedidoDeFactura("#1521"), "#1521");
  assert.equal(pedidoDeFactura("1521"), "#1521");
  assert.equal(pedidoDeFactura(" cs17562 "), "CS17562");
  assert.equal(pedidoDeFactura(""), null);
});

test("la lectura que sube el lector se valida", () => {
  assert.equal(leerLecturaSiscore(null), null);
  assert.equal(leerLecturaSiscore({ guias: [] }), null);
  const l = leerLecturaSiscore({
    cliente: "KENKU",
    desde: "2026-10-14",
    hasta: "2026-11-12",
    guias: [
      { guia: "7224141834", factura: "#1521", estado: "CLIENTE NO LOCALIZADO", fecha_estado: "2026-11-12", recaudo: "32.90", historial: [{ estado: "Recolectado", fecha: "2026-11-11", hora: "11:32:06" }, { estado: "", fecha: "x" }] },
      { guia: "<script>", factura: "#1" },
    ],
  })!;
  assert.equal(l.guias.length, 1);
  assert.equal(l.guias[0].cliente, "KENKU");
  assert.equal(l.guias[0].recaudo, 32.9);
  assert.equal(l.guias[0].historial.length, 1);
});

test("SISCORE: la cuenta se une a su tienda por el nombre, la unidad o el comienzo", () => {
  const tiendas = [{ nombre: "Kenku" }, { nombre: "Oferfy" }];
  assert.equal(tiendaDeClienteSiscore("KENKU", tiendas)?.nombre, "Kenku");
  assert.equal(tiendaDeClienteSiscore("OFERFY", tiendas)?.nombre, "Oferfy");
  assert.equal(tiendaDeClienteSiscore("OFERFY PAN", tiendas)?.nombre, "Oferfy");
  assert.equal(tiendaDeClienteSiscore("Oferfy Panamá", tiendas)?.nombre, "Oferfy");
  assert.equal(tiendaDeClienteSiscore("NUVO", tiendas), null);
});
