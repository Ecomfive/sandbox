import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntradaIndice } from "@/lib/ayuda/indice";
import { buscarParaAsistente } from "./buscar-ayuda";

const indice: EntradaIndice[] = [
  { tipo: "guia", titulo: "Inventario › Remisiones", texto: "Una remisión manda unidades a una bodega externa (Dropi, Effi, Dunamixfy).", href: "/ayuda/guias/inventario#seccion-2" },
  { tipo: "termino", titulo: "Bodega en Dropi", texto: "B81 = Proveedor Ecomfive, B280 = Bodega Dropi Panamá.", href: "/ayuda/glosario?q=Bodega" },
  { tipo: "paso", titulo: "Compras › Etapas", texto: "Cada compra pasa por sus etapas hasta llegar a la bodega.", href: "/ayuda/guias/compras#seccion-0" },
];

test("encuentra por palabras sueltas, sin tildes, y el título pesa más", () => {
  const r = buscarParaAsistente(indice, "¿Cómo hago una remisión a Dunamixfy?");
  assert.equal(r[0].titulo, "Inventario › Remisiones");
  assert.equal(r[0].enlace, "/ayuda/guias/inventario#seccion-2");
  const b = buscarParaAsistente(indice, "qué es la B81");
  assert.equal(b[0].titulo, "Bodega en Dropi");
});

test("más palabras distintas encontradas va primero; sin palabras útiles, nada", () => {
  const r = buscarParaAsistente(indice, "bodega compra etapas");
  assert.equal(r[0].titulo, "Compras › Etapas");
  assert.deepEqual(buscarParaAsistente(indice, "como para que"), []);
});

test("recorta el texto largo", () => {
  const largo: EntradaIndice[] = [{ tipo: "manual", titulo: "Manual de remisiones", texto: "x".repeat(3000), href: "/ayuda/manuales/1" }];
  assert.equal(buscarParaAsistente(largo, "remisiones", 6, 100)[0].texto.length, 101);
});
