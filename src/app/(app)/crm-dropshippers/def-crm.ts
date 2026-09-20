import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export const ESTADOS = [
  { valor: "prospecto", etiqueta: "Prospecto" },
  { valor: "activo", etiqueta: "Activo" },
  { valor: "inactivo", etiqueta: "Inactivo" },
] as const;

export const TIPOS_INTERACCION = [
  { valor: "llamada", etiqueta: "Llamada" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "email", etiqueta: "Correo" },
  { valor: "reunion", etiqueta: "Reunión" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export const etiquetaEstado = (valor: string) => ESTADOS.find((e) => e.valor === valor)?.etiqueta ?? valor;
export const etiquetaTipo = (valor: string) => TIPOS_INTERACCION.find((t) => t.valor === valor)?.etiqueta ?? valor;

export interface FilaDropshipper {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  estado: string;
  volumen: number | null;
  notas: string | null;
}

export interface FilaInteraccion {
  id: string;
  fecha: string;
  dropshipper: string;
  tipo: string;
  nota: string;
}

/** Directorio de dropshippers: se agrupa por estado y "Inactivos" es lo cerrado (oculto por defecto). */
export const DEF_DROPSHIPPERS: DefTabla<FilaDropshipper> = {
  clave: "crm-dropshippers",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (d) => [d.estado],
      opciones: () => ESTADOS.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ["activo", "prospecto", "inactivo"],
    },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (d) => d.nombre },
    { id: "contacto", etiqueta: "Correo o teléfono", tipo: "texto", valor: (d) => `${d.email ?? ""} ${d.telefono ?? ""}` },
    { id: "volumen", etiqueta: "Volumen mensual", tipo: "numero", valor: (d) => d.volumen },
    { id: "notas", etiqueta: "Notas", tipo: "texto", valor: (d) => d.notas ?? "" },
  ],
  cerrados: {
    etiqueta: "Inactivos",
    esCerrado: (d) => d.estado === "inactivo",
    campoEstado: "estado",
    valoresCerrados: ["inactivo"],
    ocultosPorDefecto: true,
  },
};

/** Bitácora de interacciones: se agrupa por dropshipper o por tipo de contacto. */
export const DEF_INTERACCIONES: DefTabla<FilaInteraccion> = {
  clave: "crm-interacciones",
  campos: [
    {
      id: "dropshipper",
      etiqueta: "Dropshipper",
      tipo: "seleccion",
      valores: (i) => [i.dropshipper || SIN_VALOR],
      etiquetaSinValor: "Sin dropshipper",
      agrupable: true,
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (i) => [i.tipo],
      opciones: () => TIPOS_INTERACCION.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })),
      agrupable: true,
    },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (i) => i.fecha },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (i) => i.nota },
  ],
};
