// Datos de la persona que compró, enmascarados para la ficha de una orden. Los completos solo salen con «Mostrar datos»
// (permiso de escritura y una línea en la auditoría). Prueba en `cliente.test.ts`.

export interface ClienteMostrado {
  nombre: string;
  telefono: string;
  direccion: string;
  corregimiento: string;
  notas: string;
}

/** «María López» → «M**** L****»: la inicial de cada palabra y asteriscos. */
export function enmascararNombre(nombre: string | null | undefined): string {
  if (!nombre) return "";
  return nombre
    .trim()
    .split(/\s+/)
    .map((p) => (p.length <= 1 ? "*" : `${p[0]}${"*".repeat(Math.min(p.length - 1, 6))}`))
    .join(" ");
}

/** Solo los dos últimos dígitos: «66718422» → «******22». Con menos de 6 dígitos no se muestra nada. */
export function enmascararTelefono(telefono: string | null | undefined): string {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (d.length < 6) return d ? "***" : "";
  return `${"*".repeat(d.length - 2)}${d.slice(-2)}`;
}

/** La dirección y las notas no se dejan ver ni en parte (pueden traer teléfonos o referencias de la casa). */
export const enmascararTexto = (t: string | null | undefined): string => (t ? "••••••" : "");

export function enmascararCliente(c: {
  nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  corregimiento: string | null;
  notas: string | null;
}): ClienteMostrado {
  return {
    nombre: enmascararNombre(c.nombre),
    telefono: enmascararTelefono(c.telefono),
    direccion: enmascararTexto(c.direccion),
    // El corregimiento solo dice la zona: se deja ver para entender la logística.
    corregimiento: c.corregimiento ?? "",
    notas: enmascararTexto(c.notas),
  };
}
