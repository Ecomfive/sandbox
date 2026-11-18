import assert from "node:assert/strict";
import test from "node:test";
import { esAvisoDePantalla, rutaInterna, sinMostrar, type AvisoEnPantalla } from "./avisos-pantalla";

const aviso = (id: string, creadoEn: string): AvisoEnPantalla => ({ id, tipo: "llegada", titulo: "t", texto: null, href: "/llegadas/x", creadoEn });

test("solo salen en pantalla los avisos de llegada de Compras y de remisión", () => {
  assert.equal(esAvisoDePantalla("llegada"), true);
  assert.equal(esAvisoDePantalla("remision"), true);
  assert.equal(esAvisoDePantalla("adelanto"), true);
  for (const t of ["mencion", "tarea", "sin_stock", "whatsapp", "proveedor", "cierre"]) assert.equal(esAvisoDePantalla(t), false, t);
});

test("el botón de la tarjeta nunca lleva fuera del sistema", () => {
  assert.equal(rutaInterna("/llegadas/abc"), "/llegadas/abc");
  assert.equal(rutaInterna("/compras/lista?abrir=1"), "/compras/lista?abrir=1");
  assert.equal(rutaInterna("https://otro.sitio/x"), "/notificaciones");
  assert.equal(rutaInterna("//otro.sitio/x"), "/notificaciones");
  assert.equal(rutaInterna("javascript:alert(1)"), "/notificaciones");
});

test("sinMostrar deja lo que no se ha mostrado, del más viejo al más nuevo", () => {
  const lista = [aviso("b", "2026-11-17T10:05:00Z"), aviso("a", "2026-11-17T10:00:00Z"), aviso("c", "2026-11-17T10:10:00Z")];
  assert.deepEqual(sinMostrar(lista, new Set(["b"])).map((x) => x.id), ["a", "c"]);
  assert.deepEqual(sinMostrar(lista, new Set(lista.map((x) => x.id))), []);
});
