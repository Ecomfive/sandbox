import assert from "node:assert/strict";
import { test } from "node:test";
import { avisoTrasClaveNueva, avisoTrasSuspender, detalleSalida, esFuncionSinMigrar, FALTA_MIGRACION_SESIONES, motivoFallaSesiones, textoRol } from "./sesiones";

test("reconoce la función que falta (migración 0318 sin correr)", () => {
  assert.equal(esFuncionSinMigrar({ code: "PGRST202", message: "x" }), true);
  assert.equal(esFuncionSinMigrar({ code: "42883", message: "x" }), true);
  assert.equal(esFuncionSinMigrar({ message: "Could not find the function public.cerrar_sesiones_usuario(p_usuario) in the schema cache" }), true);
  assert.equal(esFuncionSinMigrar({ code: "57014", message: "canceling statement due to statement timeout" }), false);
  assert.equal(esFuncionSinMigrar(null), false);
  assert.equal(motivoFallaSesiones({ code: "PGRST202" }), FALTA_MIGRACION_SESIONES);
  assert.equal(motivoFallaSesiones({ code: "08006" }), "la base no respondió");
});

test("sin fallas no hay aviso; con fallas, dice que la suspensión quedó y qué falló", () => {
  assert.equal(avisoTrasSuspender({ bloqueada: true, sesionesCerradas: true, fallas: [] }), null);
  const aviso = avisoTrasSuspender({ bloqueada: true, sesionesCerradas: false, fallas: [`no se cerraron sus sesiones (${FALTA_MIGRACION_SESIONES})`] });
  assert.ok(aviso?.startsWith("Quedó suspendida"));
  assert.ok(aviso?.includes("No podrá volver a entrar"));
  assert.ok(aviso?.includes("0318"));
  const sinBloqueo = avisoTrasSuspender({ bloqueada: false, sesionesCerradas: true, fallas: ["no se pudo bloquear su ingreso"] });
  assert.ok(sinBloqueo?.includes("puede seguir viva"));
  assert.ok(!sinBloqueo?.includes("No podrá volver a entrar"));
});

test("aviso tras la contraseña temporal solo si no se cerraron las sesiones", () => {
  assert.equal(avisoTrasClaveNueva(null), null);
  assert.ok(avisoTrasClaveNueva("la base no respondió")?.includes("la base no respondió"));
});

test("el historial dice qué se hizo con la cuenta", () => {
  assert.equal(detalleSalida({ bloqueada: true, sesionesCerradas: true, fallas: [] }), "Se le bloqueó el ingreso y se cerraron sus sesiones abiertas");
  assert.equal(detalleSalida({ bloqueada: true, sesionesCerradas: false, fallas: ["x"] }), "ingreso bloqueado, no se pudieron cerrar sus sesiones (x)");
});

test("nombre del rol para el historial", () => {
  assert.equal(textoRol(null, {}), "Sin rol");
  assert.equal(textoRol("a", { a: "Admin" }), "Admin");
  assert.equal(textoRol("b", { a: "Admin" }), "b");
});
