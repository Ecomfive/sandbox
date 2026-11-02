import type { PedidoPortal } from "./datos";
import { diaPanama } from "./fechas";
import type { CeldaExcel, ColumnaExcel } from "./excel";
import { COLUMNA_HOJA, TIPO_CAMPO, type CampoRegistro, type FilaRegistro } from "./registro-pagos";
import type { Textos } from "./textos";

// Qué columnas y qué filas lleva el Excel de cada pestaña del portal del proveedor (28 oct 2026): las mismas que se ven en pantalla, en el
// idioma de la persona, pero con los números y las fechas como valores (no como texto con «$» o «12 nov»). Puro: la pantalla le pasa los
// textos y la traducción; el archivo se arma con `filasAXlsx`. Desde el 29 oct 2026 cada hoja abre con la foto de referencia (y Cotizados
// también con la foto real), como miniatura dentro de la celda: la celda lleva la dirección de la foto y `filasAXlsx` la trae.

export interface ContextoExcel {
  t: Textos;
  /** Lo escrito por personas, en el idioma de la pantalla. */
  tr: (texto: string | null | undefined) => string;
  /** La vía de envío como se ve («Marítimo FCL»). */
  via: (p: Pick<PedidoPortal, "via" | "modalidad">) => string;
}

export interface FilaExcel {
  /** La llave de la fila en pantalla: con ella se sabe cuáles marcó la persona. */
  id: string;
  celdas: CeldaExcel[];
}

export interface HojaExcel {
  columnas: ColumnaExcel[];
  filas: FilaExcel[];
}

const dia = (momento: string | null) => (momento ? diaPanama(momento) : null);

const columnaFoto = (titulo: string): ColumnaExcel => ({ titulo, tipo: "imagen", ancho: 11 });

/** Foto, producto, código y destino: lo que abre cada pestaña de pedidos. */
const columnasBase = (t: Textos): ColumnaExcel[] => [
  columnaFoto(t.colFotoReferencia),
  { titulo: t.colProducto, tipo: "texto", ancho: 38 },
  { titulo: t.colCodigo, tipo: "texto", ancho: 16 },
  { titulo: t.colDestino, tipo: "texto", ancho: 10 },
  { titulo: t.colVia, tipo: "texto", ancho: 18 },
];
const celdasBase = (p: PedidoPortal, c: ContextoExcel): CeldaExcel[] => [p.fotoReferencia, c.tr(p.producto), p.referencia, p.paisCodigo, c.via(p)];

export function hojaPorCotizar(pedidos: PedidoPortal[], c: ContextoExcel): HojaExcel {
  return {
    columnas: [...columnasBase(c.t), { titulo: c.t.colUnidades, tipo: "entero" }, { titulo: c.t.colNota, tipo: "texto", ancho: 44 }],
    filas: pedidos.map((p) => ({ id: p.id, celdas: [...celdasBase(p, c), p.unidades, c.tr(p.notaParaProveedor)] })),
  };
}

/** `fotos` son las fotos reales que mandó el proveedor (por pedido), las mismas que se ven en la pestaña. */
export function hojaCotizados(pedidos: PedidoPortal[], c: ContextoExcel, fotos: Record<string, string> = {}): HojaExcel {
  const [referencia, ...base] = columnasBase(c.t);
  return {
    columnas: [
      referencia,
      columnaFoto(c.t.colFotoReal),
      ...base,
      { titulo: c.t.colPedidas, tipo: "entero" },
      { titulo: c.t.colUnidades, tipo: "entero" },
      { titulo: c.t.colPorUnidad, tipo: "dinero" },
      { titulo: c.t.colTotal, tipo: "dinero" },
      { titulo: c.t.colComentario, tipo: "texto", ancho: 44 },
    ],
    filas: pedidos.map((p) => {
      const [foto, ...base] = celdasBase(p, c);
      return { id: p.id, celdas: [foto, fotos[p.id] ?? null, ...base, p.unidadesPedidas, p.unidades, p.costoUnitario, p.montoTotal, c.tr(p.comentarioProveedor)] };
    }),
  };
}

export function hojaProduccion(pedidos: PedidoPortal[], c: ContextoExcel): HojaExcel {
  return {
    columnas: [
      ...columnasBase(c.t),
      { titulo: c.t.colUnidades, tipo: "entero" },
      { titulo: c.t.colTotal, tipo: "dinero" },
      { titulo: c.t.colConfirmado, tipo: "fecha" },
    ],
    filas: pedidos.map((p) => ({ id: p.id, celdas: [...celdasBase(p, c), p.unidades, p.montoTotal, dia(p.confirmadoEn)] })),
  };
}

/** `filas` son las de la pestaña ya calculadas (días en tránsito, plazo prometido y estado en el texto de la pantalla). */
export function hojaEnviados(filas: { p: PedidoPortal; dias: number; plazo: string; estado: string }[], c: ContextoExcel): HojaExcel {
  return {
    columnas: [
      ...columnasBase(c.t),
      { titulo: c.t.colUnidades, tipo: "entero" },
      { titulo: c.t.colConfirmado, tipo: "fecha" },
      { titulo: c.t.colEnviado, tipo: "fecha" },
      { titulo: c.t.colDias, tipo: "entero" },
      { titulo: c.t.colPrometido, tipo: "texto", ancho: 14 },
      { titulo: c.t.colEstado, tipo: "texto", ancho: 22 },
    ],
    filas: filas.map(({ p, dias, plazo, estado }) => ({ id: p.id, celdas: [...celdasBase(p, c), p.unidades, dia(p.confirmadoEn), p.fechaEnvio, dias, plazo, estado] })),
  };
}

/** Las columnas del Registro de pagos después del producto, en el orden de la hoja de Shen Zhen. */
export const CAMPOS_PAGOS: { campo: CampoRegistro; titulo: keyof Textos }[] = [
  { campo: "unidades", titulo: "colCantidad" },
  { campo: "monto", titulo: "colMonto" },
  { campo: "fecha_envio", titulo: "colEntrega" },
  { campo: "anticipo", titulo: "colAnticipo" },
  { campo: "pagado", titulo: "colPagado" },
  { campo: "fecha_pago", titulo: "colFechaPago" },
  { campo: "sin_pagar", titulo: "colSinPagar" },
  { campo: "vence", titulo: "colVencePago" },
  { campo: "saldo", titulo: "colSaldo" },
  { campo: "llegada", titulo: "colLlegada" },
  { campo: "fecha_pago_saldo", titulo: "colPagoSaldo" },
];

export function hojaPagos(filas: FilaRegistro[], c: ContextoExcel): HojaExcel {
  const tipoDe = (campo: CampoRegistro): ColumnaExcel["tipo"] => (TIPO_CAMPO[campo] === "fecha" ? "fecha" : campo === "unidades" ? "entero" : "dinero");
  return {
    columnas: [
      columnaFoto(c.t.colFotoReferencia),
      { titulo: c.t.colProducto, tipo: "texto", ancho: 38 },
      { titulo: c.t.colCodigo, tipo: "texto", ancho: 16 },
      { titulo: c.t.colDestino, tipo: "texto", ancho: 10 },
      ...CAMPOS_PAGOS.map(({ campo, titulo }) => ({ titulo: `${c.t[titulo] as string} (${COLUMNA_HOJA[campo]})`, tipo: tipoDe(campo), ancho: 16 })),
    ],
    filas: filas.map((f) => ({
      id: f.fila,
      celdas: [f.foto, c.tr(String(f.valores.producto ?? "")), f.referencia, f.paisCodigo, ...CAMPOS_PAGOS.map(({ campo }) => f.valores[campo] ?? null)],
    })),
  };
}
