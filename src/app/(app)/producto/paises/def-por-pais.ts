import { PAISES_NAV } from "@/lib/nav-data";
import { ETIQUETA_ESTADO_PAIS, type CeldaPais, type EstadoPais } from "@/lib/producto/por-pais";
import type { DefTabla } from "@/lib/tabla/motor";
import { ETIQUETA_CLASE } from "../def-producto";

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
  celdas: Record<string, CeldaPais>;
  /** Los países donde ya existe (publicado, comprado o con stock). */
  existeEn: string[];
}

const ORDEN_ESTADOS: EstadoPais[] = ["publicado", "comprado", "stock", "enviar", "no", "archivado", "descartado", "descontinuado"];
const OPCIONES_ESTADO = () => ORDEN_ESTADOS.map((valor) => ({ valor, etiqueta: ETIQUETA_ESTADO_PAIS[valor] }));
const NOMBRE_PAIS = (codigo: string) => PAISES_NAV.find((p) => p.codigo === codigo)?.nombre ?? codigo;

/**
 * La tabla de «Por país»: un filtro por cada país de la barra (cómo está ahí el producto), «Existe en» y «Todavía no está en» (los
 * países donde no existe), más el tipo y el estado del producto. Los países son fijos (los de `PAISES_NAV`) para que la definición sea
 * una constante del módulo; uno que la persona no puede ver simplemente no tiene casillas.
 */
export const DEF_POR_PAIS: DefTabla<FilaPorPais> = {
  clave: "producto-por-pais",
  campos: [
    {
      id: "falta",
      etiqueta: "Todavía no está en",
      tipo: "seleccion",
      valores: (f) => Object.keys(f.celdas).filter((c) => !f.existeEn.includes(c)),
      opciones: () => PAISES_NAV.map((p) => ({ valor: p.codigo, etiqueta: p.nombre })),
    },
    {
      id: "existe",
      etiqueta: "Existe en",
      tipo: "seleccion",
      valores: (f) => (f.existeEn.length ? f.existeEn : ["__sin_valor__"]),
      opciones: () => [...PAISES_NAV.map((p) => ({ valor: p.codigo, etiqueta: p.nombre })), { valor: "__sin_valor__", etiqueta: "En ningún país" }],
    },
    ...PAISES_NAV.map((p) => ({
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
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "codigo", etiqueta: "SKU", tipo: "texto", valor: (f) => f.codigo },
  ],
  csvAntes: [
    { etiqueta: "N.º", valor: (f) => f.numero },
    ...PAISES_NAV.map((p) => ({ etiqueta: `Detalle ${p.nombre}`, valor: (f: FilaPorPais) => detalleCelda(f.celdas[p.codigo]) })),
  ],
};

/** Lo que dice la casilla en palabras (para el CSV y el nombre del botón). */
export function detalleCelda(c: CeldaPais | undefined): string {
  if (!c) return "";
  const partes: string[] = [ETIQUETA_ESTADO_PAIS[c.estado]];
  const activas = c.publicaciones.filter((p) => p.activa);
  if (activas.length) partes.push(activas.map((p) => `${p.plataforma === "drop" ? "Drop" : "Dropi"} ${p.id}`).join(", "));
  if (c.compras.length) partes.push(`${c.compras.length} ${c.compras.length === 1 ? "compra" : "compras"} · ${c.unidadesCompradas.toLocaleString("es")} u.`);
  if (c.unidadesStock > 0) partes.push(`${c.unidadesStock.toLocaleString("es")} u. en bodega`);
  if (c.decision?.motivo) partes.push(c.decision.motivo);
  return partes.join(" · ");
}

export { NOMBRE_PAIS };
