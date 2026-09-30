import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaProductoTest {
  id: string;
  nombre: string;
  fechaCreacion: string | null;
  fuente: string | null;
  paginaProductoUrl: string | null;
  videoUrl: string | null;
  categoria: string | null;
  anguloVenta: string | null;
  /** País de origen del anuncio ganador que se copió — no tiene relación con el país donde se prueba. */
  worldwide: string | null;
  adLibrary: string | null;
  fechaTest: string | null;
  estado: string;
  clickup: boolean;
  testNumero: string | null;
  calculadoraUrl: string | null;
  campanaUrl: string | null;
  /** Las métricas del test en Meta Ads, siempre en dólares — igual que en Filtros. */
  metricaOferta: number | null;
  metricaCpm: number | null;
  metricaEfectividad: number | null;
  metricaHookRate: number | null;
  metricaCtr: number | null;
  metricaCpa: number | null;
  metricaGasto: number | null;
  metricaCompras: number | null;
  metricaCvr: number | null;
  revisado: boolean;
  ultimaRevision: string | null;
  observacion: string | null;
  explotacion: string | null;
  creadoEn: string;
}

/** El resultado del test, calcado de la columna «Estado» de la hoja "Control de Testing en Países" (los 9
 * valores que de verdad usa, no solo los del embudo principal). */
export const ESTADOS = [
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "backlog", etiqueta: "Backlog" },
  { valor: "testeando", etiqueta: "Testeando" },
  { valor: "reserva", etiqueta: "Reserva" },
  { valor: "consulta", etiqueta: "Consulta" },
  { valor: "winner", etiqueta: "Winner" },
  { valor: "enviado_a_compras", etiqueta: "Enviado a Compras" },
  { valor: "fallido", etiqueta: "Fallido" },
  { valor: "descartado", etiqueta: "Descartado" },
] as const;

const ESTADO_ETIQUETA: Record<string, string> = Object.fromEntries(ESTADOS.map((e) => [e.valor, e.etiqueta]));
export const etiquetaEstado = (valor: string) => ESTADO_ETIQUETA[valor] ?? valor;

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "#8D8D8D",
  backlog: "#b5bcc2",
  testeando: "#02BCD4",
  reserva: "#7C4DFF",
  consulta: "#f9d900",
  winner: "#1bbc9c",
  enviado_a_compras: "#0880EA",
  fallido: "#FFC53D",
  descartado: "#e50000",
};
export const colorEstado = (valor: string) => ESTADO_COLOR[valor] ?? "#8D8D8D";

export const TEST_NUMEROS = [
  { valor: "test_1", etiqueta: "Test 1" },
  { valor: "test_2", etiqueta: "Test 2" },
  { valor: "test_3", etiqueta: "Test 3" },
] as const;

const TEST_NUMERO_ETIQUETA: Record<string, string> = Object.fromEntries(TEST_NUMEROS.map((t) => [t.valor, t.etiqueta]));
export const etiquetaTestNumero = (valor: string | null) => (valor ? (TEST_NUMERO_ETIQUETA[valor] ?? valor) : null);

const TEST_NUMERO_COLOR: Record<string, string> = {
  test_1: "#1bbc9c",
  test_2: "#f9d900",
  test_3: "#e50000",
};
export const colorTestNumero = (valor: string) => TEST_NUMERO_COLOR[valor] ?? "#8D8D8D";

export const NIVELES_EXPLOTACION = [
  { valor: "alta", etiqueta: "Alta" },
  { valor: "media", etiqueta: "Media" },
  { valor: "baja", etiqueta: "Baja" },
  { valor: "no_aplica", etiqueta: "No aplica" },
] as const;

const EXPLOTACION_ETIQUETA: Record<string, string> = Object.fromEntries(NIVELES_EXPLOTACION.map((e) => [e.valor, e.etiqueta]));
export const etiquetaExplotacion = (valor: string | null) => (valor ? (EXPLOTACION_ETIQUETA[valor] ?? valor) : null);

const EXPLOTACION_COLOR: Record<string, string> = {
  alta: "#1bbc9c",
  media: "#f9d900",
  baja: "#e50000",
  no_aplica: "#8D8D8D",
};
export const colorExplotacion = (valor: string) => EXPLOTACION_COLOR[valor] ?? "#8D8D8D";

/** El ciclo termina en «Enviado a Compras», «Fallido» o «Descartado»: como en Filtros, se ocultan por defecto. */
const ESTADOS_CERRADOS = ["winner", "enviado_a_compras", "fallido", "descartado"];

export const DEF_PRODUCTOS_TEST: DefTabla<FilaProductoTest> = {
  clave: "productos-test-v1",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => ESTADOS.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS.map((e) => e.valor),
    },
    {
      id: "testNumero",
      etiqueta: "Test #",
      tipo: "seleccion",
      valores: (f) => [f.testNumero ?? SIN_VALOR],
      opciones: () => [...TEST_NUMEROS.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })), { valor: SIN_VALOR, etiqueta: "Sin test" }],
      etiquetaSinValor: "Sin test",
      agrupable: true,
    },
    {
      id: "explotacion",
      etiqueta: "Explotación",
      tipo: "seleccion",
      valores: (f) => [f.explotacion ?? SIN_VALOR],
      opciones: () => [...NIVELES_EXPLOTACION.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })), { valor: SIN_VALOR, etiqueta: "Sin definir" }],
      etiquetaSinValor: "Sin definir",
      agrupable: true,
    },
    {
      id: "categoria",
      etiqueta: "Categoría",
      tipo: "seleccion",
      valores: (f) => [f.categoria ?? SIN_VALOR],
      etiquetaSinValor: "Sin categoría",
      agrupable: true,
    },
    { id: "anguloVenta", etiqueta: "Ángulo de Venta", tipo: "texto", valor: (f) => f.anguloVenta ?? "" },
    { id: "observacion", etiqueta: "Observación", tipo: "texto", valor: (f) => f.observacion ?? "" },
  ],
  vistaInicial: { agrupar: "estado", orden: "desc" },
  cerrados: {
    etiqueta: "Cerrados",
    esCerrado: (f) => ESTADOS_CERRADOS.includes(f.estado),
    campoEstado: "estado",
    valoresCerrados: ESTADOS_CERRADOS,
    ocultosPorDefecto: true,
    exclusivo: true,
  },
};
