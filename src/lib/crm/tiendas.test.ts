import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceDeTienda, nombreDeEnlace, tiendaGuardada } from "./tiendas";

test("un enlace de tienda: con o sin https, solo http y https", () => {
  assert.equal(enlaceDeTienda("mitienda.com"), "https://mitienda.com/");
  assert.equal(enlaceDeTienda("https://instagram.com/mitienda"), "https://instagram.com/mitienda");
  assert.equal(enlaceDeTienda("www.tienda.com.co/productos?x=1"), "https://www.tienda.com.co/productos?x=1");
  assert.equal(enlaceDeTienda("http://tienda.pa"), "http://tienda.pa/");
  assert.equal(enlaceDeTienda("Innovalabs"), null);
  assert.equal(enlaceDeTienda("Clovin web"), null);
  assert.equal(enlaceDeTienda("javascript:alert(1)"), null);
  assert.equal(enlaceDeTienda("ftp://tienda.com"), null);
  assert.equal(enlaceDeTienda("https://usuario:clave@tienda.com"), null);
  assert.equal(enlaceDeTienda("https://localhost"), null);
});

test("cómo se lee un enlace en la ficha", () => {
  assert.equal(nombreDeEnlace("https://www.instagram.com/mitienda/"), "instagram.com/mitienda");
  assert.equal(nombreDeEnlace("https://mitienda.com/"), "mitienda.com");
  assert.equal(nombreDeEnlace("https://tienda.com/" + "a".repeat(60), 20).length, 20);
});

test("lo que se guarda: el enlace completo o el nombre tal cual", () => {
  assert.equal(tiendaGuardada(" mitienda.com "), "https://mitienda.com/");
  assert.equal(tiendaGuardada(" Innovalabs "), "Innovalabs");
});
