/**
 * Datos de un dropshipper que se editan ahí mismo, en el bloque «Datos» de su ficha (CRM y chat de WhatsApp): nombre, estado, WhatsApp, tiendas,
 * ciudad, fecha de ingreso, productos y correo. Muchos vinieron de ClickUp; desde el 29 oct 2026 se corrigen con un clic y, desde el 30 oct 2026
 * (pedido de Jhokser), también el nombre, el estado, el WhatsApp, las tiendas y los productos: ya no hay un botón «Editar» aparte. Aquí vive la
 * regla de cada uno, que el servidor vuelve a aplicar (`cambiarDatoDropshipper`).
 */

import { tiendaGuardada } from "./tiendas";

export type CampoDato = "nombre" | "estado" | "telefono" | "tiendas" | "ciudad" | "ingreso" | "productos" | "correo";

export const CAMPOS_DATO: Record<CampoDato, { columna: string; etiqueta: string }> = {
  nombre: { columna: "nombre", etiqueta: "Nombre" },
  estado: { columna: "estado", etiqueta: "Estado" },
  telefono: { columna: "contacto_telefono", etiqueta: "WhatsApp" },
  tiendas: { columna: "tiendas", etiqueta: "Tiendas" },
  ciudad: { columna: "ciudad", etiqueta: "Ciudad" },
  ingreso: { columna: "fecha_ingreso", etiqueta: "Ingreso" },
  productos: { columna: "productos", etiqueta: "Productos" },
  correo: { columna: "contacto_email", etiqueta: "Correo" },
};

/** Lo que el WhatsApp devuelve al guardarse: el número nunca vuelve a la pantalla, solo que ya hay uno. */
export const NUMERO_REGISTRADO = "registrado";

/** Los estados de un dropshipper (los mismos de `ESTADOS` en `def-crm.ts`). */
export const ESTADOS_DATO = ["prospecto", "activo", "inactivo"] as const;

/** Una lista escrita separada por comas, sin vacíos ni repetidos (sin importar mayúsculas), hasta `max` elementos. */
export function listaDeTexto(texto: string, max: number, largo: number): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const parte of texto.split(",")) {
    const e = parte.replace(/\s+/g, " ").trim().slice(0, largo);
    if (!e || vistos.has(e.toLowerCase())) continue;
    vistos.add(e.toLowerCase());
    lista.push(e);
    if (lista.length >= max) break;
  }
  return lista;
}

export const esCampoDato = (v: unknown): v is CampoDato => typeof v === "string" && Object.hasOwn(CAMPOS_DATO, v);

const MAX_CIUDAD = 80;
const MAX_CORREO = 120;
const MAX_NOMBRE = 120;
const MAX_TIENDAS = 20;
const MAX_PRODUCTOS = 60;

/** Deja el valor listo para guardar (vacío = sin dato) o dice qué está mal. `hoy` es AAAA-MM-DD: el ingreso no puede ser futuro. */
export function normalizarDato(campo: CampoDato, valor: string, hoy: string): { valor: string | null } | { error: string } {
  const limpio = valor.replace(/\s+/g, " ").trim();
  // Estos no se pueden dejar vacíos: el nombre es lo que identifica al dropshipper, el estado siempre tiene uno y el número no se borra desde aquí.
  if (campo === "nombre") {
    if (!limpio) return { error: "Escribe el nombre del dropshipper." };
    if (limpio.length > MAX_NOMBRE) return { error: `El nombre puede tener hasta ${MAX_NOMBRE} letras.` };
    return { valor: limpio };
  }
  if (campo === "estado") return (ESTADOS_DATO as readonly string[]).includes(limpio) ? { valor: limpio } : { error: "Elige un estado válido." };
  if (campo === "telefono") return limpio ? { valor: limpio } : { error: "Escribe el número con el prefijo del país, p. ej. +57 300 111 2233." };
  if (!limpio) return { valor: null };
  if (campo === "tiendas" || campo === "productos") {
    // Una tienda puede ser un enlace («mitienda.com»): se guarda completo («https://mitienda.com/») para abrirla desde la ficha.
    const lista = campo === "tiendas" ? listaDeTexto(listaDeTexto(limpio, MAX_TIENDAS, 200).map(tiendaGuardada).join(","), MAX_TIENDAS, 200) : listaDeTexto(limpio, MAX_PRODUCTOS, 120);
    return { valor: lista.length ? lista.join(", ") : null };
  }
  if (campo === "ciudad") {
    if (limpio.length > MAX_CIUDAD) return { error: `La ciudad puede tener hasta ${MAX_CIUDAD} letras.` };
    return { valor: limpio };
  }
  if (campo === "correo") {
    const correo = limpio.toLowerCase();
    if (correo.length > MAX_CORREO || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: "El correo no es válido." };
    return { valor: correo };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return { error: "La fecha de ingreso no es válida." };
  const fecha = new Date(`${limpio}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== limpio) return { error: "La fecha de ingreso no es válida." };
  if (limpio > hoy) return { error: "La fecha de ingreso no puede ser futura." };
  if (limpio < "2000-01-01") return { error: "La fecha de ingreso no es válida." };
  return { valor: limpio };
}
