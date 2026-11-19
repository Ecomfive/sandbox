import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avisoCuentaNueva,
  avisoDosPasosActivada,
  avisoDosPasosQuitada,
  avisoIngresoCorreo,
  avisoIngresoIp,
  avisoPuedeModificarUsuarios,
  avisoRolConUsuarios,
  claveAviso,
  puedeModificarUsuarios,
  textoSeguro,
} from "./avisos-seguridad-reglas";
import { LIMITES } from "./limite-reglas";

test("un aviso por motivo y asunto: misma clave para lo mismo, otra para otro asunto u otro motivo", () => {
  const a = claveAviso("ingreso_correo", "ana@ecomfive.com");
  assert.match(a, /^aviso-ingreso-correo:[0-9a-f]{32}$/);
  assert.equal(a, claveAviso("ingreso_correo", "ana@ecomfive.com"));
  assert.notEqual(a, claveAviso("ingreso_correo", "beto@ecomfive.com"));
  assert.notEqual(a, claveAviso("ingreso_ip", "ana@ecomfive.com"));
  // Un rol distinto es otro aviso (le cambian el rol dos veces a dos roles con edición: dos avisos).
  assert.notEqual(claveAviso("puede_modificar_usuarios", "p1", "r1"), claveAviso("puede_modificar_usuarios", "p1", "r2"));
  // La ventana de los avisos es de una hora y deja uno.
  assert.deepEqual(LIMITES.avisoSeguridad, { ventana: 3600, maximo: 1 });
});

test("quién puede modificar Usuarios y roles: rol con edición, salvo que lo propio lo baje; lo propio también la da", () => {
  const edicion = [{ modulo: "usuarios", solo_lectura: false }];
  const lectura = [{ modulo: "usuarios", solo_lectura: true }];
  assert.equal(puedeModificarUsuarios(edicion, []), true);
  assert.equal(puedeModificarUsuarios(lectura, []), false);
  assert.equal(puedeModificarUsuarios([], []), false);
  assert.equal(puedeModificarUsuarios(edicion, [{ modulo: "usuarios", nivel: "lectura" }]), false);
  assert.equal(puedeModificarUsuarios(edicion, [{ modulo: "usuarios", nivel: "ninguno" }]), false);
  assert.equal(puedeModificarUsuarios(lectura, [{ modulo: "usuarios", nivel: "edicion" }]), true);
  assert.equal(puedeModificarUsuarios([{ modulo: "compras", solo_lectura: false }], []), false);
});

test("los textos dicen lo necesario y nunca una contraseña", () => {
  const c = avisoIngresoCorreo({ correo: "ana@ecomfive.com", ip: "203.0.113.7", cuenta: "Ana", regla: LIMITES.loginCorreoIp });
  assert.ok(c.texto.includes("5 claves equivocadas en 15 minutos"));
  assert.ok(c.texto.includes("ana@ecomfive.com") && c.texto.includes("203.0.113.7") && c.texto.includes("Es la cuenta de Ana."));
  assert.ok(c.texto.includes("desde otra, la persona puede entrar"));
  assert.ok(avisoIngresoCorreo({ correo: "x@y.com", ip: null, cuenta: null, regla: LIMITES.loginCorreoIp }).texto.includes("No es de ninguna cuenta"));
  const varias = avisoIngresoCorreo({ correo: "ana@ecomfive.com", ip: "203.0.113.9", cuenta: null, regla: LIMITES.loginCorreoAviso, variasIp: true });
  assert.ok(varias.texto.startsWith("10 claves equivocadas en 15 minutos para ana@ecomfive.com, desde varias IP (la última, 203.0.113.9)"));
  assert.ok(avisoIngresoIp({ ip: "198.51.100.1", regla: LIMITES.loginIp }).texto.startsWith("30 intentos fallidos de ingreso en 15 minutos desde la IP 198.51.100.1"));
  const nueva = avisoCuentaNueva({ nombre: "Beto", email: "beto@ecomfive.com", rol: "Administrador", puedeModificarUsuarios: true });
  assert.ok(nueva.texto.startsWith("Beto <beto@ecomfive.com> ya puede entrar al sistema con el rol Administrador."));
  assert.ok(nueva.texto.includes("Ese rol puede modificar Usuarios y roles."));
  assert.ok(!avisoCuentaNueva({ nombre: null, email: "c@d.com", rol: null, puedeModificarUsuarios: false }).texto.includes("Ese rol"));
  assert.ok(avisoPuedeModificarUsuarios({ nombre: "Beto", email: null, rol: "Admin" }).texto.startsWith("Beto ahora puede modificar Usuarios y roles (rol Admin)"));
  assert.ok(avisoRolConUsuarios({ rol: "Logística", personas: 1 }).texto.includes("(1 persona)"));
  for (const a of [c, nueva]) assert.ok(!/contrase|clave temporal/i.test(a.texto), a.texto);
  for (const a of [c, varias, nueva]) assert.ok(a.titulo.length <= 200 && a.texto.length <= 500);
});

test("lo escrito por otro entra limpio y corto", () => {
  assert.equal(textoSeguro('Ana <img src=x onerror="y">\n'), "Ana img src=x onerror=y");
  assert.equal(textoSeguro("x".repeat(300)).length, 120);
  const c = avisoIngresoCorreo({ correo: "ana@ecomfive.com", ip: null, cuenta: "<b>Ana</b>", regla: LIMITES.loginCorreoIp });
  assert.ok(!/[<>]/.test(c.texto), c.texto);
});

test("avisos de la verificación en dos pasos: activada y quitada", () => {
  const act = avisoDosPasosActivada({ nombre: "Beto", email: "beto@ecomfive.com", rol: "Administrador", puedeModificarUsuarios: true });
  assert.ok(act.texto.startsWith("Beto <beto@ecomfive.com> (rol Administrador) activó la verificación en dos pasos"));
  assert.ok(act.texto.includes("Esta cuenta puede modificar Usuarios y roles.") && act.texto.includes("quítasela en su ficha"));
  assert.ok(!avisoDosPasosActivada({ nombre: "C", email: null, rol: null, puedeModificarUsuarios: false }).texto.includes("Esta cuenta puede"));
  const q = avisoDosPasosQuitada({ nombre: "Beto", email: null, por: "Hernán" });
  assert.ok(q.texto.startsWith("Hernán le quitó la verificación en dos pasos a Beto:"));
  assert.ok(avisoDosPasosQuitada({ nombre: null, email: "c@d.com", por: null }).texto.startsWith("Alguien le quitó"));
  assert.notEqual(claveAviso("dos_pasos_activada", "p1"), claveAviso("dos_pasos_quitada", "p1"));
  for (const a of [act, q]) assert.ok(a.titulo.length <= 200 && a.texto.length <= 500);
});
