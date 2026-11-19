import assert from "node:assert/strict";
import test from "node:test";
import { geografiaDe } from "./geografia";
import { CANTONES_COSTA_RICA, CANTONES_DE_CIUDAD_COSTA_RICA, DISTRITOS_DE_CIUDAD_ALAJUELA, esCantonDeCostaRica, geografiaDeCostaRica, zonaDeCostaRica } from "./zonas-costa-rica";

test("los 11 cantones de San José son ciudad en todos sus distritos", () => {
  assert.equal(CANTONES_DE_CIUDAD_COSTA_RICA.length, 11);
  for (const c of CANTONES_DE_CIUDAD_COSTA_RICA) assert.equal(zonaDeCostaRica({ canton: c }), "ciudad", c);
  assert.equal(zonaDeCostaRica({ canton: "ESCAZU", distrito: "San Rafael" }), "ciudad");
});

test("el resto del país es interior: San José lejano, Cartago, Heredia, Guanacaste, Puntarenas y Limón", () => {
  for (const c of ["Pérez Zeledón", "Puriscal", "León Cortés Castro", "Cartago", "Paraíso", "Heredia", "Belén", "Liberia", "Puntarenas", "Limón", "San Carlos", "Río Cuarto"]) assert.equal(zonaDeCostaRica({ canton: c }), "interior", c);
});

test("el cantón de Alajuela se reparte por distrito, y su distrito San José tiene un barrio interior", () => {
  for (const d of DISTRITOS_DE_CIUDAD_ALAJUELA) assert.equal(zonaDeCostaRica({ canton: "Alajuela", distrito: d }), "ciudad", d);
  for (const d of ["San Isidro", "Sabanilla", "San Rafael", "Sarapiquí"]) assert.equal(zonaDeCostaRica({ canton: "Alajuela", distrito: d }), "interior", d);
  assert.equal(zonaDeCostaRica({ canton: "Alajuela", distrito: "San José", barrio: "Santa Rita" }), "interior");
  assert.equal(zonaDeCostaRica({ canton: "Alajuela", distrito: "San José", barrio: "Pueblo Nuevo" }), "ciudad");
  // sin distrito no se adivina
  assert.equal(zonaDeCostaRica({ canton: "Alajuela" }), null);
});

test("un cantón que no existe no tiene zona, y los nombres de cantón no se repiten entre provincias", () => {
  assert.equal(zonaDeCostaRica({ canton: "Narnia" }), null);
  assert.equal(esCantonDeCostaRica("belen"), true);
  const todos = Object.values(CANTONES_COSTA_RICA).flat().map((c) => c.toLowerCase());
  assert.equal(new Set(todos).size, todos.length);
  assert.equal(todos.length, 84);
});

test("la geografía de Costa Rica trae las dos etiquetas, la lista de ciudad y dice que no hay pago por adelantado", () => {
  assert.equal(geografiaDe("cr"), geografiaDeCostaRica());
  const g = geografiaDeCostaRica();
  for (const x of ["CIUDAD-GAM", "INTERIOR-ZONAS-ALEJADAS", "Curridabat", "Río Segundo", "Santa Rita", "Pérez Zeledón", "Cartago, Heredia, Guanacaste, Puntarenas y Limón"]) assert.ok(g.includes(x), x);
  assert.match(g, /nunca respondas «adelantado»/);
});
