// Lo que se puede corregir a mano desde la ficha de una persona (lógica pura; prueba en `edicion.test.ts`). Las
// acciones viven en `src/app/(app)/nomina/actions.ts`; aquí solo se valida lo que llega del navegador.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s === "" ? null : s;
};
const fechaONula = (v: unknown): string | null | "invalida" => {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(v)) ? v : "invalida";
};
const uuidONulo = (v: unknown): string | null | "invalido" => {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" && UUID.test(v) ? v : "invalido";
};

export interface DatosPersona {
  unidad_id: string | null;
  cargo: string | null;
  estatus: string | null;
  correo: string | null;
  medio_pago: string | null;
  fecha_fin: string | null;
  activo: boolean;
}

export function validarDatosPersona(v: unknown): DatosPersona | { error: string } {
  if (!v || typeof v !== "object") return { error: "Datos inválidos." };
  const d = v as Record<string, unknown>;
  const unidad = uuidONulo(d.unidad_id);
  if (unidad === "invalido") return { error: "Tienda inválida." };
  const fin = fechaONula(d.fecha_fin);
  if (fin === "invalida") return { error: "Fecha de fin inválida." };
  const correo = texto(d.correo, 160);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: "El correo no tiene la forma nombre@dominio." };
  return {
    unidad_id: unidad,
    cargo: texto(d.cargo, 120),
    estatus: texto(d.estatus, 60),
    correo: correo?.toLowerCase() ?? null,
    medio_pago: texto(d.medio_pago, 80),
    fecha_fin: fin,
    activo: d.activo !== false,
  };
}

export interface DatosLinea {
  unidad_id: string | null;
  pagado: boolean | null;
  fecha_pago: string | null;
  medio_pago: string | null;
  referencia: string | null;
  observacion: string | null;
}

export function validarDatosLinea(v: unknown): DatosLinea | { error: string } {
  if (!v || typeof v !== "object") return { error: "Datos inválidos." };
  const d = v as Record<string, unknown>;
  const unidad = uuidONulo(d.unidad_id);
  if (unidad === "invalido") return { error: "Tienda inválida." };
  const fecha = fechaONula(d.fecha_pago);
  if (fecha === "invalida") return { error: "Fecha de pago inválida." };
  if (d.pagado !== null && d.pagado !== undefined && typeof d.pagado !== "boolean") return { error: "«Pagado» inválido." };
  return {
    unidad_id: unidad,
    pagado: typeof d.pagado === "boolean" ? d.pagado : null,
    fecha_pago: fecha,
    medio_pago: texto(d.medio_pago, 80),
    referencia: texto(d.referencia, 120),
    observacion: texto(d.observacion, 500),
  };
}
