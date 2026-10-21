import assert from "node:assert/strict";
import { test } from "node:test";
import { armarPersonasConAcceso, type PerfilConRol } from "../acceso-seccion";

const perfil = (id: string, nombre: string, rol_id: string | null, activo = true): PerfilConRol => ({ id, nombre, email: `${nombre.toLowerCase()}@x.com`, avatar_url: null, rol_id, activo });
const permisos = [{ rol_id: "r1", solo_lectura: false, rol: "Compras" }];

test("sin permisos propios, entra quien tiene el módulo por su rol", () => {
  const lista = armarPersonasConAcceso([perfil("a", "Ana", "r1"), perfil("b", "Beto", "r2"), perfil("c", "Cris", null)], permisos);
  assert.deepEqual(lista.map((p) => [p.id, p.rol, p.soloLectura]), [["a", "Compras", false]]);
});

test("lo propio manda sobre el rol: suma a quien no lo tenía, quita a quien sí y cambia el nivel", () => {
  const perfiles = [perfil("a", "Ana", "r1"), perfil("b", "Beto", "r2"), perfil("c", "Cris", "r1"), perfil("d", "Dani", "r1")];
  const lista = armarPersonasConAcceso(
    perfiles,
    permisos,
    [
      { perfil_id: "a", nivel: "ninguno" },
      { perfil_id: "b", nivel: "lectura" },
      { perfil_id: "c", nivel: "lectura" },
    ],
    new Map([["r2", "Atención"]]),
  );
  assert.deepEqual(
    lista.map((p) => [p.id, p.rol, p.soloLectura]),
    [
      ["b", "Atención", true],
      ["c", "Compras", true],
      ["d", "Compras", false],
    ],
  );
});

test("una persona suspendida no cuenta", () => {
  assert.equal(armarPersonasConAcceso([perfil("a", "Ana", "r1", false)], permisos).length, 0);
});
