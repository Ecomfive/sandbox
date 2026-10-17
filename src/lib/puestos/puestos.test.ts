import assert from "node:assert/strict";
import { test } from "node:test";
import { avanceOnboarding, estadoDe, type Enlace, type Hechos } from "./onboarding";
import { armarArbol, cierraCiclo, jefesDe, puestosACargo, vacantes, type Ocupante, type PuestoBase } from "./organigrama";
import { limpiarKra, validarPuesto } from "./puesto";

const ID = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const p = (n: number, reporta: number | null, extra: Partial<PuestoBase> = {}): PuestoBase => ({
  id: ID(n),
  nombre: `Puesto ${n}`,
  area: "Marketing",
  reportaA: reporta === null ? null : ID(reporta),
  plazas: 1,
  activo: true,
  ...extra,
});

test("validarPuesto: pide nombre y área de la lista, y limpia los KRA", () => {
  assert.deepEqual(validarPuesto({ area: "Marketing" }), { error: "Falta el nombre del puesto." });
  assert.deepEqual(validarPuesto({ nombre: "Media Buyer", area: "Otra" }), { error: "Elige el área del puesto." });
  const ok = validarPuesto({ nombre: "  Media   Buyer ", area: "Marketing", plazas: "2", kra: "Rentabilidad\n\nrentabilidad \nPedidos" });
  assert.ok(!("error" in ok));
  assert.equal(ok.nombre, "Media Buyer");
  assert.equal(ok.plazas, 2);
  assert.deepEqual(ok.kra, ["Rentabilidad", "Pedidos"]);
  assert.equal(ok.reportaA, null);
});

test("validarPuesto: no se reporta a sí mismo, plazas de 1 a 99 y hasta 6 KRA", () => {
  assert.ok("error" in validarPuesto({ nombre: "A", area: "Ventas", reporta_a: ID(1) }, ID(1)));
  assert.ok("error" in validarPuesto({ nombre: "A", area: "Ventas", reporta_a: "x' or 1=1" }));
  assert.ok("error" in validarPuesto({ nombre: "A", area: "Ventas", plazas: 0 }));
  assert.ok("error" in validarPuesto({ nombre: "A", area: "Ventas", plazas: 1.5 }));
  assert.ok("error" in validarPuesto({ nombre: "A", area: "Ventas", kra: ["1", "2", "3", "4", "5", "6", "7"] }));
  assert.deepEqual(limpiarKra(null), []);
});

test("armarArbol: jerarquía, inactivos fuera y lo huérfano queda como raíz", () => {
  const arbol = armarArbol([p(1, null), p(2, 1), p(3, 2), p(4, 9), p(5, 1, { activo: false }), p(6, 5)]);
  assert.deepEqual(arbol.map((n) => n.puesto.id).sort(), [ID(1), ID(4), ID(6)].sort());
  const cabeza = arbol.find((n) => n.puesto.id === ID(1))!;
  assert.deepEqual(cabeza.hijos.map((n) => n.puesto.id), [ID(2)]);
  assert.deepEqual(cabeza.hijos[0].hijos.map((n) => n.puesto.id), [ID(3)]);
});

test("armarArbol: un ciclo que ya está en la base no hace perder puestos", () => {
  const arbol = armarArbol([p(1, 2), p(2, 1)]);
  const todos = (ns: ReturnType<typeof armarArbol>): string[] => ns.flatMap((n) => [n.puesto.id, ...todos(n.hijos)]);
  assert.deepEqual(todos(arbol).sort(), [ID(1), ID(2)]);
});

test("cierraCiclo: detecta cuando el nuevo jefe depende del puesto", () => {
  const puestos = [p(1, null), p(2, 1), p(3, 2)];
  assert.equal(cierraCiclo(ID(1), ID(3), puestos), true);
  assert.equal(cierraCiclo(ID(1), ID(1), puestos), true);
  assert.equal(cierraCiclo(ID(3), ID(1), puestos), false);
  assert.equal(cierraCiclo(ID(1), null, puestos), false);
});

test("vacantes y jefes: se salta el puesto vacante y nadie es su propio jefe", () => {
  const puestos = [p(1, null), p(2, 1, { plazas: 2 }), p(3, 2)];
  const ocupantes: Ocupante[] = [
    { puestoId: ID(1), usuarioId: "dir", principal: true },
    { puestoId: ID(3), usuarioId: "ana", principal: true },
    { puestoId: ID(2), usuarioId: "dir", principal: false },
  ];
  assert.equal(vacantes(puestos[1], ocupantes), 1);
  assert.equal(vacantes(puestos[0], ocupantes), 0);
  assert.deepEqual(jefesDe("ana", puestos, ocupantes), { puestoId: ID(2), usuarioIds: ["dir"] });
  assert.equal(jefesDe("dir", puestos, ocupantes), null);
  assert.equal(jefesDe("nadie", puestos, ocupantes), null);
  const vacio: Ocupante[] = [{ puestoId: ID(1), usuarioId: "dir", principal: true }, { puestoId: ID(3), usuarioId: "ana", principal: true }];
  assert.deepEqual(jefesDe("ana", puestos, vacio), { puestoId: ID(1), usuarioIds: ["dir"] });
  assert.deepEqual(puestosACargo([ID(1)], puestos).map((x) => x.id), [ID(2)]);
});

test("onboarding: cursos aprobados, manuales leídos y desactualizados, por etapa", () => {
  const enlaces: Enlace[] = [
    { tipo: "curso", id: "primeros-pasos", etapa: 30, orden: 0 },
    { tipo: "manual", id: "m1", etapa: 30, orden: 1 },
    { tipo: "manual", id: "m2", etapa: 60, orden: 0 },
    { tipo: "curso", id: "ya-no-existe", etapa: 60, orden: 1 },
    { tipo: "manual", id: "m3", etapa: null, orden: 0 },
  ];
  const h: Hechos = {
    cursosAprobados: new Map([["primeros-pasos", "2026-10-01T00:00:00Z"]]),
    lecturas: new Map([
      ["m1", "2026-10-02T00:00:00Z"],
      ["m2", "2026-10-02T00:00:00Z"],
    ]),
    manualActualizado: new Map([
      ["m1", "2026-10-01T00:00:00Z"],
      ["m2", "2026-10-05T00:00:00Z"],
    ]),
    cursosExistentes: new Set(["primeros-pasos"]),
  };
  assert.equal(estadoDe(enlaces[1], h), "hecho");
  assert.equal(estadoDe(enlaces[2], h), "desactualizado");
  const a = avanceOnboarding(enlaces, h);
  assert.deepEqual(a.etapas, [
    { etapa: 30, hechos: 2, total: 2 },
    { etapa: 60, hechos: 0, total: 1 },
  ]);
  assert.equal(a.hechos, 2);
  assert.equal(a.total, 3);
});
