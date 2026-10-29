// Quién respondió en un chat de la Bandeja y con qué cargo (pedido de Hernán, 29 oct 2026: «que salga quién respondió cada cosa, si líder
// comercial o atención»). El cargo es el puesto de la persona en Puestos (lo eligió Hernán: todos los del CRM son Admin con las tres áreas, así
// que los permisos no los distinguen); sin puesto, el área del CRM según sus permisos. Sin dependencias de servidor: lo usan los datos de la
// bandeja, la ficha del chat y las pruebas.

import { MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION, type AreaCrm } from "./areas";

/** Cómo se nombra el área de una persona sin puesto (no la del chat): Comercial es el «Líder comercial». */
export const ETIQUETA_AREA_PERSONA: Record<AreaCrm, string> = { direccion: "Dirección", comercial: "Líder comercial", atencion: "Atención" };

/** El área de una persona según los módulos del CRM que tiene: la de más arriba, como `areaPropia`. Sin ninguno, null. */
export function areaDeModulos(modulos: Iterable<string>): AreaCrm | null {
  const m = new Set(modulos);
  if (m.has(MODULO_DIRECCION)) return "direccion";
  if (m.has(MODULO_COMERCIAL)) return "comercial";
  return m.has(MODULO_ATENCION) ? "atencion" : null;
}

/**
 * El cargo con que se muestra a una persona en el chat: su puesto principal activo en Puestos (si tiene varios sin principal, el primero por
 * nombre); sin puesto, la etiqueta de su área del CRM; sin nada, null.
 */
export function cargoDePersona(
  perfilId: string,
  puestos: readonly { id: string; nombre: string; activo: boolean }[],
  ocupantes: readonly { puestoId: string; usuarioId: string; principal: boolean }[],
  area: AreaCrm | null,
): string | null {
  const activos = new Map(puestos.filter((p) => p.activo && p.nombre.trim()).map((p) => [p.id, p.nombre.trim()]));
  const suyos = ocupantes
    .filter((o) => o.usuarioId === perfilId && activos.has(o.puestoId))
    .sort((a, b) => Number(b.principal) - Number(a.principal) || activos.get(a.puestoId)!.localeCompare(activos.get(b.puestoId)!, "es"));
  if (suyos.length) return activos.get(suyos[0].puestoId)!;
  return area ? ETIQUETA_AREA_PERSONA[area] : null;
}

export interface QuienRespondio {
  nombre: string;
  /** Su puesto (o su área del CRM), si se sabe. */
  cargo: string | null;
  /** Cuántos mensajes mandó al dropshipper (las notas privadas no cuentan). */
  mensajes: number;
  /** Su último mensaje (ISO). */
  ultimo: string;
}

/**
 * Las personas del equipo que le escribieron al dropshipper en este chat, una vez cada una y la más reciente primero. Solo los mensajes
 * salientes con autor: las notas privadas no son respuestas y lo que se mandó desde la app del celular no dice quién fue.
 */
export function quienesRespondieron(mensajes: readonly { direccion: string; autor: string | null; autorCargo?: string | null; momento: string }[]): QuienRespondio[] {
  const porNombre = new Map<string, QuienRespondio>();
  for (const m of mensajes) {
    const nombre = m.autor?.trim();
    if (m.direccion !== "saliente" || !nombre) continue;
    const antes = porNombre.get(nombre);
    if (!antes) porNombre.set(nombre, { nombre, cargo: m.autorCargo ?? null, mensajes: 1, ultimo: m.momento });
    else {
      antes.mensajes++;
      if (m.momento > antes.ultimo) antes.ultimo = m.momento;
      if (!antes.cargo && m.autorCargo) antes.cargo = m.autorCargo;
    }
  }
  return [...porNombre.values()].sort((a, b) => (a.ultimo < b.ultimo ? 1 : a.ultimo > b.ultimo ? -1 : 0));
}
