import { ETIQUETA_ESTADO_PAIS, type AccionPorPais, type CeldaPais, type EstadoPais } from "@/lib/producto/por-pais";
import type { DefTabla } from "@/lib/tabla/motor";
import { ETIQUETA_CLASE } from "@/app/(app)/producto/def-producto";

/**
 * Los países de «Gestión por país» (5 nov 2026, Alcides): los de la operación y los que se evalúan para entrar, en este orden. Colombia no va
 * (no se piensa entrar mercancía por ahora). Para sumar uno, agrégalo aquí (y a la tabla `paises` si no está).
 */
export const PAISES_GESTION: { codigo: string; nombre: string }[] = [
  { codigo: "PA", nombre: "Panamá" },
  { codigo: "CR", nombre: "Costa Rica" },
  { codigo: "MX", nombre: "México" },
  { codigo: "GT", nombre: "Guatemala" },
  { codigo: "VE", nombre: "Venezuela" },
  { codigo: "SV", nombre: "El Salvador" },
  { codigo: "HN", nombre: "Honduras" },
  { codigo: "NI", nombre: "Nicaragua" },
];

export interface PaisColumna {
  id: string;
  codigo: string;
  nombre: string;
}

/** Un producto de «Producto › Por país»: sus datos y, por código de país, su casilla. */
export interface FilaPorPais {
  id: string;
  numero: number | null;
  codigo: string;
  nombre: string;
  foto: string | null;
  tipo: string;
  clase: string;
  /** Día en que se creó el producto (AAAA-MM-DD). */
  creado: string;
  celdas: Record<string, CeldaPais>;
  /** Los países donde ya existe (publicado, comprado o con stock). */
  existeEn: string[];
  /** Las tarjetas de acción en que cuenta (`accionesPorPais`). */
  acciones: AccionPorPais[];
  /** Los países donde es una oportunidad por decidir (`paisesPorDecidir`). */
  porDecidir: string[];
}

export const ETIQUETA_ACCION_PAIS: Record<AccionPorPais, string> = {
  por_decidir: "Por decidir",
  por_enviar: "Por enviar",
  comprado_sin_publicar: "Comprado sin publicar",
  solo_archivado: "Solo archivado",
  un_pais: "En un solo país",
  ningun_pais: "Activos en ningún país",
  descartado: "Descartados",
};

const ORDEN_ESTADOS: EstadoPais[] = ["publicado", "comprado", "stock", "enviar", "no", "archivado", "descartado", "descontinuado"];
const OPCIONES_ESTADO = () => ORDEN_ESTADOS.map((valor) => ({ valor, etiqueta: ETIQUETA_ESTADO_PAIS[valor] }));
const NOMBRE_PAIS = (codigo: string) => PAISES_GESTION.find((p) => p.codigo === codigo)?.nombre ?? codigo;

/**
 * La tabla de «Por país»: un filtro por cada país de la barra (cómo está ahí el producto), «Existe en» y «Todavía no está en» (los
 * países donde no existe), más el tipo y el estado del producto. Los países son fijos (`PAISES_GESTION`) para que la definición sea
 * una constante del módulo; uno que la persona no puede ver simplemente no tiene casillas.
 */
export const DEF_POR_PAIS: DefTabla<FilaPorPais> = {
  clave: "producto-por-pais",
  campos: [
    {
      id: "accion",
      etiqueta: "Para hacer",
      tipo: "seleccion",
      valores: (f) => f.acciones,
      opciones: () => (Object.keys(ETIQUETA_ACCION_PAIS) as AccionPorPais[]).map((valor) => ({ valor, etiqueta: ETIQUETA_ACCION_PAIS[valor] })),
    },
    {
      id: "decidir",
      etiqueta: "Por decidir en",
      tipo: "seleccion",
      valores: (f) => f.porDecidir,
      opciones: () => PAISES_GESTION.map((p) => ({ valor: p.codigo, etiqueta: p.nombre })),
    },
    {
      id: "falta",
      etiqueta: "Todavía no está en",
      tipo: "seleccion",
      valores: (f) => Object.keys(f.celdas).filter((c) => !f.existeEn.includes(c)),
      opciones: () => PAISES_GESTION.map((p) => ({ valor: p.codigo, etiqueta: p.nombre })),
    },
    {
      id: "existe",
      etiqueta: "Existe en",
      tipo: "seleccion",
      valores: (f) => (f.existeEn.length ? f.existeEn : ["__sin_valor__"]),
      opciones: () => [...PAISES_GESTION.map((p) => ({ valor: p.codigo, etiqueta: p.nombre })), { valor: "__sin_valor__", etiqueta: "En ningún país" }],
    },
    ...PAISES_GESTION.map((p) => ({
      id: `pais_${p.codigo}`,
      etiqueta: p.nombre,
      tipo: "seleccion" as const,
      valores: (f: FilaPorPais) => (f.celdas[p.codigo] ? [f.celdas[p.codigo].estado] : []),
      opciones: OPCIONES_ESTADO,
      agrupable: true,
      ordenGrupos: ORDEN_ESTADOS,
    })),
    { id: "cuantos", etiqueta: "Países donde existe", tipo: "numero", valor: (f) => f.existeEn.length },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (f) => [f.tipo],
      opciones: () => [
        { valor: "simple", etiqueta: "Simple" },
        { valor: "compuesto", etiqueta: "Compuesto" },
      ],
      agrupable: true,
    },
    {
      id: "clase",
      etiqueta: "Estado del producto",
      tipo: "seleccion",
      valores: (f) => [f.clase],
      opciones: () => Object.entries(ETIQUETA_CLASE).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
    },
    { id: "creado", etiqueta: "Creado el", tipo: "fecha", valor: (f) => f.creado || null },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "codigo", etiqueta: "SKU", tipo: "texto", valor: (f) => f.codigo },
  ],
  csvAntes: [
    { etiqueta: "N.º", valor: (f) => f.numero },
    ...PAISES_GESTION.map((p) => ({ etiqueta: `Detalle ${p.nombre}`, valor: (f: FilaPorPais) => detalleCelda(f.celdas[p.codigo]) })),
  ],
};

/** Lo que dice la casilla en palabras (para el CSV y el nombre del botón). */
export function detalleCelda(c: CeldaPais | undefined): string {
  if (!c) return "";
  const partes: string[] = [ETIQUETA_ESTADO_PAIS[c.estado]];
  const activas = c.publicaciones.filter((p) => p.activa);
  if (activas.length) partes.push(activas.map((p) => `${p.plataforma === "drop" ? "Drop" : "Dropi"} ${p.id}`).join(", "));
  if (c.compras.length) partes.push(`${c.compras.length} ${c.compras.length === 1 ? "compra" : "compras"} · ${c.unidadesCompradas.toLocaleString("es")} u.`);
  if (c.unidadesDisponibles > 0) partes.push(`${c.unidadesDisponibles.toLocaleString("es")} u. disponibles`);
  if (c.decision?.motivo) partes.push(c.decision.motivo);
  return partes.join(" · ");
}

export { NOMBRE_PAIS };
