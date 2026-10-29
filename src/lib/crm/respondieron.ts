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
  /** Su foto en el sistema (Usuarios), si tiene. */
  foto?: string | null;
}

/**
 * Las personas del equipo que le escribieron al dropshipper en este chat, una vez cada una y la más reciente primero. Solo los mensajes
 * salientes con autor: las notas privadas no son respuestas y lo que se mandó desde la app del celular no dice quién fue.
 */
export function quienesRespondieron(mensajes: readonly { direccion: string; autor: string | null; autorCargo?: string | null; autorFoto?: string | null; momento: string }[]): QuienRespondio[] {
  const porNombre = new Map<string, QuienRespondio>();
  for (const m of mensajes) {
    const nombre = m.autor?.trim();
    if (m.direccion !== "saliente" || !nombre) continue;
    const antes = porNombre.get(nombre);
    if (!antes) porNombre.set(nombre, { nombre, cargo: m.autorCargo ?? null, mensajes: 1, ultimo: m.momento, ...(m.autorFoto ? { foto: m.autorFoto } : {}) });
    else {
      antes.mensajes++;
      if (m.momento > antes.ultimo) antes.ultimo = m.momento;
      if (!antes.cargo && m.autorCargo) antes.cargo = m.autorCargo;
      if (!antes.foto && m.autorFoto) antes.foto = m.autorFoto;
    }
  }
  return [...porNombre.values()].sort((a, b) => (a.ultimo < b.ultimo ? 1 : a.ultimo > b.ultimo ? -1 : 0));
}

/** Una persona en un globito: su nombre, su cargo y su foto. */
export interface PersonaGlobo {
  nombre: string;
  cargo: string | null;
  foto: string | null;
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** La palabra con que se reconoce un área en un cargo («Atención al cliente», «Líder comercial»). */
const PALABRA_AREA: Record<AreaCrm, string> = { atencion: "atencion", comercial: "comercial", direccion: "direccion" };

/**
 * Quién atiende el chat (29 oct 2026, pedido de Alcides): quien lo tomó o intervino (`asignada`) y la persona del área del chat que le ha
 * respondido (su cargo dice el área: «Atención al cliente» en Atención, «Líder comercial» en Comercial); si nadie del área ha respondido, la última
 * persona que respondió que no sea quien intervino. Lo de «Desde el celular» no es una persona. Sin repetir; quien lo lleva primero.
 */
export function quienesAtienden(asignada: PersonaGlobo | null, respondieron: readonly QuienRespondio[], area: AreaCrm, celular = "Desde el celular"): PersonaGlobo[] {
  const personas = respondieron.filter((r) => r.nombre !== celular);
  const delArea = personas.filter((r) => r.cargo && sinAcentos(r.cargo).includes(PALABRA_AREA[area]));
  const delChat = delArea.length ? delArea : personas.filter((r) => r.nombre !== asignada?.nombre).slice(0, 1);
  const lista: PersonaGlobo[] = asignada ? [asignada] : [];
  for (const r of delChat) if (!lista.some((p) => p.nombre === r.nombre)) lista.push({ nombre: r.nombre, cargo: r.cargo, foto: r.foto ?? null });
  return lista;
}
