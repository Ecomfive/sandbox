// El color con el que se dibuja un rol (su cuadro con la inicial). Son tonos pastel con texto oscuro: se leen igual en el tema claro y
// en el oscuro porque el cuadro lleva su propio fondo.

export interface ColorRol {
  valor: string;
  etiqueta: string;
  fondo: string;
  texto: string;
}

export const COLORES_ROL: ColorRol[] = [
  { valor: "rosa", etiqueta: "Rosa", fondo: "#fde7f1", texto: "#9d174d" },
  { valor: "indigo", etiqueta: "Índigo", fondo: "#e0e7ff", texto: "#3730a3" },
  { valor: "verde", etiqueta: "Verde", fondo: "#dcfce7", texto: "#166534" },
  { valor: "ambar", etiqueta: "Ámbar", fondo: "#fef3c7", texto: "#92400e" },
  { valor: "turquesa", etiqueta: "Turquesa", fondo: "#cffafe", texto: "#155e75" },
  { valor: "violeta", etiqueta: "Violeta", fondo: "#f3e8ff", texto: "#6b21a8" },
];

export const esColorRol = (valor: unknown): valor is string => typeof valor === "string" && COLORES_ROL.some((c) => c.valor === valor);

/** El color elegido para el rol; sin elegir, uno que sale de su nombre (siempre el mismo para el mismo nombre). */
export function colorDeRol(color: string | null | undefined, nombre: string): ColorRol {
  const elegido = COLORES_ROL.find((c) => c.valor === color);
  if (elegido) return elegido;
  let hash = 0;
  for (const letra of nombre) hash = (hash * 31 + letra.charCodeAt(0)) >>> 0;
  return COLORES_ROL[hash % COLORES_ROL.length];
}

export const inicialDeRol = (nombre: string): string => (nombre.trim().charAt(0) || "?").toUpperCase();
