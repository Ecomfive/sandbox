import assert from "node:assert/strict";
import { test } from "node:test";
import { MODULOS } from "../modulos";
import { aAccesoPlano, cobertura, diferencias, esAdministrador, nivelesDeRol, nivelesEfectivos } from "./acceso";
import { accionPermitida, alcanceDe, campoVisible, contarAjustes, filasDeAfinado, nivelDeCampo, pestanaVisible, resolverAfinado, valorValido, type FilaAfinada } from "./afinado";
import { AREAS_ACCESO, CATALOGO_COMPRAS, MODULOS_ACCESO, catalogoDe } from "./catalogo";
import { colorDeRol } from "./color-rol";

test("la matriz tiene todos los módulos del sistema, una sola vez cada uno", () => {
  const claves = MODULOS_ACCESO.map((m) => m.clave);
  assert.equal(new Set(claves).size, claves.length);
  assert.deepEqual([...claves].sort(), MODULOS.map((m) => m.clave).sort());
  assert.ok(AREAS_ACCESO.every((a) => a.modulos.length > 0));
});

test("el nivel del rol sale de solo_lectura", () => {
  assert.deepEqual(nivelesDeRol([{ modulo: "compras", solo_lectura: false }, { modulo: "producto", solo_lectura: true }]), { compras: "w", producto: "r" });
});

test("un permiso propio manda sobre el del rol, también para quitar", () => {
  const rol = [
    { modulo: "pedidos-dropi", solo_lectura: false },
    { modulo: "extractos", solo_lectura: false },
    { modulo: "compras", solo_lectura: true },
  ];
  const efectivos = nivelesEfectivos(rol, [
    { modulo: "gastos", nivel: "lectura" },
    { modulo: "pedidos-dropi", nivel: "lectura" },
    { modulo: "extractos", nivel: "ninguno" },
    { modulo: "compras", nivel: "edicion" },
  ]);
  assert.deepEqual(efectivos, { "pedidos-dropi": "r", compras: "w", gastos: "r" });
  const plano = aAccesoPlano(efectivos);
  assert.deepEqual(plano.modulos.sort(), ["compras", "gastos", "pedidos-dropi"]);
  assert.deepEqual(plano.modulosSoloLectura.sort(), ["gastos", "pedidos-dropi"]);
});

test("la cobertura cuenta sobre los módulos de la matriz", () => {
  const c = cobertura({ compras: "w", producto: "r", inventario: "r", noexiste: "w" });
  assert.deepEqual(c, { w: 1, r: 2, n: MODULOS_ACCESO.length - 3, total: MODULOS_ACCESO.length });
});

test("las diferencias solo traen lo que cambió, en el orden de la matriz", () => {
  const rol = [{ modulo: "pedidos-dropi", solo_lectura: false }, { modulo: "extractos", solo_lectura: false }];
  const efectivos = nivelesEfectivos(rol, [{ modulo: "gastos", nivel: "lectura" }, { modulo: "pedidos-dropi", nivel: "lectura" }]);
  assert.deepEqual(diferencias(rol, efectivos), [
    { modulo: "pedidos-dropi", delRol: "w", efectivo: "r" },
    { modulo: "gastos", delRol: "n", efectivo: "r" },
  ]);
});

const fila = (tipo: FilaAfinada["tipo"], clave: string, valor: string): FilaAfinada => ({ modulo: "compras", tipo, clave, valor });

test("sin filas, el módulo se ve completo", () => {
  const a = resolverAfinado(CATALOGO_COMPRAS, []);
  assert.equal(contarAjustes(a), 0);
  assert.ok(pestanaVisible(a, "dashboard"));
  assert.ok(accionPermitida(a, "anular"));
  assert.equal(nivelDeCampo(a, "pago1"), "editar");
  assert.equal(nivelDeCampo(a, "unitario", false), "ver");
  assert.equal(alcanceDe(a), "todas");
});

test("lo afinado del rol se junta y la persona puede soltarlo", () => {
  const rol = [fila("pestana", "dashboard", "oculta"), fila("accion", "anular", "bloqueada"), fila("campo", "pago1", "oculto"), fila("campo", "pago2", "oculto"), fila("campo", "pagado", "oculto"), fila("campo", "proveedor", "ver")];
  const delRol = resolverAfinado(CATALOGO_COMPRAS, rol);
  assert.equal(contarAjustes(delRol), 6);
  assert.ok(!pestanaVisible(delRol, "dashboard"));
  assert.ok(!accionPermitida(delRol, "anular"));
  assert.ok(!campoVisible(delRol, "pago1"));
  assert.equal(nivelDeCampo(delRol, "proveedor"), "ver");

  const conPersona = resolverAfinado(CATALOGO_COMPRAS, [...rol, fila("pestana", "dashboard", "visible"), fila("campo", "pago1", "editar"), fila("alcance", "alcance", "asignadas")]);
  assert.ok(pestanaVisible(conPersona, "dashboard"));
  assert.equal(nivelDeCampo(conPersona, "pago1"), "editar");
  assert.equal(alcanceDe(conPersona), "asignadas");
  assert.equal(contarAjustes(conPersona), 5);
});

test("lo que no está en el catálogo o no tiene sentido se ignora", () => {
  const a = resolverAfinado(CATALOGO_COMPRAS, [
    fila("pestana", "no-existe", "oculta"),
    fila("accion", "anular", "volar"),
    fila("campo", "etapa", "oculto"),
    fila("campo", "unitario", "editar"),
    fila("alcance", "alcance", "las-del-vecino"),
    { modulo: "otro-modulo", tipo: "pestana", clave: "lista", valor: "oculta" },
  ]);
  assert.equal(contarAjustes(a), 0);
});

test("un dato calculado en «ver» no cuenta como apartarse; en «oculto» sí", () => {
  assert.equal(contarAjustes(resolverAfinado(CATALOGO_COMPRAS, [fila("campo", "unitario", "ver")])), 0);
  assert.equal(contarAjustes(resolverAfinado(CATALOGO_COMPRAS, [fila("campo", "unitario", "oculto")])), 1);
});

test("las filas guardadas se pueden reconstruir del resultado", () => {
  const rol = [fila("pestana", "dashboard", "oculta"), fila("accion", "anular", "bloqueada"), fila("campo", "pago1", "oculto"), fila("alcance", "alcance", "creadas")];
  const a = resolverAfinado(CATALOGO_COMPRAS, rol);
  assert.deepEqual(resolverAfinado(CATALOGO_COMPRAS, filasDeAfinado("compras", a)), a);
});

test("valorValido revisa módulo, clave y valor", () => {
  assert.ok(valorValido(CATALOGO_COMPRAS, "campo", "monto", "oculto"));
  assert.ok(!valorValido(CATALOGO_COMPRAS, "campo", "etapa", "oculto"));
  assert.ok(!valorValido(CATALOGO_COMPRAS, "campo", "unitario", "editar"));
  assert.ok(valorValido(CATALOGO_COMPRAS, "alcance", "alcance", "asignadas"));
  assert.ok(!valorValido(CATALOGO_COMPRAS, "alcance", "otra", "asignadas"));
  assert.equal(catalogoDe("producto"), undefined);
});

test("el color de un rol es el elegido o siempre el mismo para el mismo nombre", () => {
  assert.equal(colorDeRol("verde", "X").valor, "verde");
  assert.equal(colorDeRol(null, "Compras").valor, colorDeRol(undefined, "Compras").valor);
  assert.equal(colorDeRol("no-existe", "Compras").valor, colorDeRol(null, "Compras").valor);
});

test("administra quien puede modificar Usuarios y roles; con solo lectura o sin el módulo, no", () => {
  assert.equal(esAdministrador({ modulos: ["usuarios", "compras"], modulosSoloLectura: [] }), true);
  assert.equal(esAdministrador({ modulos: ["usuarios"], modulosSoloLectura: ["usuarios"] }), false);
  assert.equal(esAdministrador({ modulos: ["compras"], modulosSoloLectura: [] }), false);
});
