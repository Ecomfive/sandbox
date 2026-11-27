import assert from "node:assert/strict";
import test from "node:test";
import { contarUrgentes, esSeccionUrgente, hayUrgentes, SIN_URGENTES, textoDeUrgentes, urgentesDeMenu } from "./avisos-urgentes";

const avisos = [
  { titulo: "Despacho pide a inventario: PED-0004", href: "/inventario-pedidos-despacho" },
  { titulo: "PED-0003 fue editado", href: "/inventario-pedidos-despacho" },
  { titulo: "PED-0002 fue enviado", href: "/inventario-despacho/solicitudes" },
  { titulo: "PED-0001 fue enviado", href: "/despacho-ciudad/pedir-inventario" },
  { titulo: "Llega a puerto: OC-0123", href: "/llegadas?tipo=puerto" },
  // No ponen nada en rojo: En Bodega, «¿Cuánto hay?» y una mención.
  { titulo: "En bodega: OC-0100", href: "/llegadas/abc" },
  { titulo: "Nicol pide fotos", href: "/inventario-pedidos-despacho/cuanto-hay" },
  { titulo: "Te mencionaron", href: "/compras/lista" },
];

test("solo los pedidos y la mercancía en puerto ponen el menú en rojo, cada uno en su entrada", () => {
  const u = contarUrgentes(avisos);
  assert.deepEqual(u, { pedidos: 2, solicitudes: 2, llegadas: 1 });
  assert.ok(hayUrgentes(u));
  assert.deepEqual(
    ["/inventario-pedidos-despacho", "/inventario-despacho", "/llegadas", "/inventario"].map((h) => urgentesDeMenu(u, h)),
    [2, 2, 1, 0],
  );
  assert.ok(!hayUrgentes(SIN_URGENTES));
});

test("el texto dice qué hay y solo se aceptan las secciones conocidas", () => {
  assert.equal(textoDeUrgentes({ pedidos: 1, solicitudes: 0, llegadas: 0 }), "Hay un aviso de pedido sin ver");
  assert.equal(textoDeUrgentes({ pedidos: 1, solicitudes: 2, llegadas: 4 }), "Hay 3 avisos de pedidos sin ver y llegó mercancía a puerto");
  assert.equal(textoDeUrgentes({ pedidos: 0, solicitudes: 0, llegadas: 1 }), "Llegó mercancía a puerto");
  assert.equal(textoDeUrgentes(SIN_URGENTES), "");
  assert.deepEqual([esSeccionUrgente("llegadas"), esSeccionUrgente("toString"), esSeccionUrgente(3)], [true, false, false]);
});
