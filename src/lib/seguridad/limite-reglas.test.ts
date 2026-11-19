import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claveLimite,
  esClaveEquivocada,
  frenaIngreso,
  inicioDeVentana,
  ipDeCabeceras,
  LIMITES,
  llegoAlMaximo,
  minutosParaReabrir,
  normalizarCorreo,
  pareceCorreo,
  textoEspera,
  textoTopeAsistente,
} from "./limite-reglas";

const cabeceras = (h: Record<string, string>) => (n: string) => h[n] ?? null;

test("la IP sale de x-real-ip y, si no, de la primera de x-forwarded-for", () => {
  assert.equal(ipDeCabeceras(cabeceras({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })), "203.0.113.7");
  assert.equal(ipDeCabeceras(cabeceras({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" })), "198.51.100.1");
  assert.equal(ipDeCabeceras(cabeceras({ "x-forwarded-for": "2001:DB8::1, 10.0.0.1" })), "2001:db8::1");
  // Lo que no tiene forma de IP no cuenta.
  assert.equal(ipDeCabeceras(cabeceras({ "x-real-ip": "<script>", "x-forwarded-for": "198.51.100.2" })), "198.51.100.2");
  assert.equal(ipDeCabeceras(cabeceras({ "x-forwarded-for": "uno.dos" })), null);
  assert.equal(ipDeCabeceras(cabeceras({})), null);
  assert.equal(ipDeCabeceras(cabeceras({ "x-real-ip": "1".repeat(60) })), null);
});

test("el correo se compara sin espacios y en minúsculas", () => {
  assert.equal(normalizarCorreo("  Ana@Ecomfive.COM "), "ana@ecomfive.com");
  assert.equal(normalizarCorreo(undefined), "");
  assert.equal(normalizarCorreo(42), "");
});

test("solo se cuenta por correo (y se nombra en un aviso) lo que tiene forma de correo", () => {
  assert.equal(pareceCorreo("ana@ecomfive.com"), true);
  assert.equal(pareceCorreo("ana.maria+dropi@sub.ecomfive.com.pa"), true);
  assert.equal(pareceCorreo(""), false);
  assert.equal(pareceCorreo("ana"), false);
  assert.equal(pareceCorreo("<img src=x>@a.com"), false);
  assert.equal(pareceCorreo("ana@ecomfive.com <script>"), false);
  assert.equal(pareceCorreo('"x"@a.com'), false);
  assert.equal(pareceCorreo(`${"a".repeat(250)}@b.com`), false);
});

test("la clave resume las partes: no guarda el correo ni la IP, y es estable", () => {
  const a = claveLimite("login-correo", "ana@ecomfive.com");
  assert.match(a, /^login-correo:[0-9a-f]{32}$/);
  assert.ok(!a.includes("ana"));
  assert.equal(a, claveLimite("login-correo", "ana@ecomfive.com"));
  assert.notEqual(a, claveLimite("login-ip", "ana@ecomfive.com"));
  assert.notEqual(claveLimite("login-correo-ip", "ana@ecomfive.com", "1.2.3.4"), claveLimite("login-correo-ip", "ana@ecomfive.com", "1.2.3.5"));
  // Las partes no se pueden correr de una a otra.
  assert.notEqual(claveLimite("x", "ab", "c"), claveLimite("x", "a", "bc"));
  // El tipo solo deja letras, números y guiones (y cabe en la columna de 200).
  assert.match(claveLimite("tipo raro;--", "x"), /^tiporaro--:[0-9a-f]{32}$/);
  assert.ok(claveLimite("t".repeat(500), "x").length <= 200);
});

test("ventanas fijas: el inicio es el múltiplo de su largo, como en la base", () => {
  const t = Date.UTC(2026, 10, 19, 14, 37, 12);
  assert.equal(inicioDeVentana(t, 15 * 60), Date.UTC(2026, 10, 19, 14, 30, 0));
  assert.equal(inicioDeVentana(t, 3600), Date.UTC(2026, 10, 19, 14, 0, 0));
  assert.equal(inicioDeVentana(t, 86400), Date.UTC(2026, 10, 19));
  assert.equal(minutosParaReabrir(t, 15 * 60), 8);
  assert.equal(minutosParaReabrir(Date.UTC(2026, 10, 19, 14, 44, 59, 500), 15 * 60), 1);
  assert.equal(minutosParaReabrir(t, 86400), 563);
});

test("textos de espera y del tope del asistente", () => {
  assert.equal(textoEspera(1), "en 1 minuto");
  assert.equal(textoEspera(23), "en 23 minutos");
  assert.equal(textoEspera(563), "en 10 horas");
  const t = Date.UTC(2026, 10, 19, 14, 37, 12);
  assert.equal(textoTopeAsistente(LIMITES.asistenteHora, false, t), "Llegaste al máximo de 30 preguntas por hora. Vuelve a probar en 23 minutos.");
  assert.equal(textoTopeAsistente(LIMITES.asistenteDia, true, t), "Llegaste al máximo de 150 preguntas por día. Vuelve a probar en 10 horas.");
});

test("tope del login: se suma antes y frena al pasar el máximo; avisa al llegar", () => {
  const nada = { correoIp: null, ip: null, correo: null };
  assert.equal(frenaIngreso(nada), false);
  // El quinto intento desde una IP todavía se prueba; el sexto ya no.
  assert.equal(frenaIngreso({ ...nada, correoIp: 5 }), false);
  assert.equal(frenaIngreso({ ...nada, correoIp: 6 }), true);
  assert.equal(frenaIngreso({ ...nada, ip: 30 }), false);
  assert.equal(frenaIngreso({ ...nada, ip: 31 }), true);
  // Por correo solo el tope es alto: muchos fallos desde otras IP no dejan afuera a la persona desde la suya.
  assert.equal(frenaIngreso({ correoIp: 1, ip: 1, correo: 50 }), false);
  assert.equal(frenaIngreso({ correoIp: 1, ip: 1, correo: 51 }), true);
  assert.ok(LIMITES.loginCorreoAviso.maximo < LIMITES.loginCorreo.maximo);
  assert.equal(llegoAlMaximo(4, LIMITES.loginCorreoIp), false);
  assert.equal(llegoAlMaximo(5, LIMITES.loginCorreoIp), true);
  assert.equal(llegoAlMaximo(null, LIMITES.loginCorreoIp), false);
});

test("los límites son razonables (ventanas de hasta un día, como exige la base)", () => {
  for (const [nombre, r] of Object.entries(LIMITES)) {
    assert.ok(r.ventana >= 1 && r.ventana <= 86400, nombre);
    assert.ok(r.maximo >= 1, nombre);
  }
  assert.ok(LIMITES.loginIp.maximo > LIMITES.loginCorreoIp.maximo);
  assert.ok(LIMITES.loginCorreo.maximo > LIMITES.loginIp.maximo);
  assert.ok(LIMITES.asistenteDia.maximo > LIMITES.asistenteHora.maximo);
});

test("solo una clave equivocada cuenta como fallo", () => {
  assert.equal(esClaveEquivocada({ code: "invalid_credentials", status: 400 }), true);
  assert.equal(esClaveEquivocada({ status: 400, message: "Invalid login credentials" }), true);
  assert.equal(esClaveEquivocada({ status: 400 }), true);
  assert.equal(esClaveEquivocada({ code: "email_not_confirmed", status: 400 }), false);
  assert.equal(esClaveEquivocada({ code: "over_request_rate_limit", status: 429 }), false);
  assert.equal(esClaveEquivocada({ status: 500, message: "fetch failed" }), false);
  assert.equal(esClaveEquivocada(null), false);
});
