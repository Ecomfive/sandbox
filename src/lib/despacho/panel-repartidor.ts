// Panel del repartidor (24 nov 2026, pedido de Hernán; prototipo aprobado https://claude.ai/artifact/TyFwhvTgvLJjsN6cM5GyEc). Reglas puras, con prueba:
// en qué pestaña va cada pedido, las formas de pago y los motivos, y el cierre del día (lo cobrado, el efectivo por tienda —se deposita por tienda— y
// el pago de envíos: entregados + fallidos con evidencia; los pospuestos no se pagan). Sin base ni React.

/** La pestaña de «Mi ruta»: en ruta (sin estado o RECOLECTADO, que es «lo cargué en bodega»), entregados o no entregados. */
export type Seccion = "ruta" | "entregados" | "no";

export function seccionDe(estado: string | null | undefined): Seccion {
  const e = (estado ?? "").trim().toUpperCase();
  if (e === "ENTREGADO") return "entregados";
  if (e === "POSPUESTO" || e === "FALLIDO" || e === "DESINTEGRADO") return "no";
  return "ruta";
}

/** Las formas de pago que elige el repartidor, con la etiqueta de Despacho ciudad que se guarda. */
export const FORMAS_PAGO = [
  { id: "efectivo", nombre: "Efectivo", etiqueta: "EFECTIVO" },
  { id: "yappy", nombre: "Yappy", etiqueta: "YAPPY" },
  { id: "mipos", nombre: "MiPOS (tarjeta)", etiqueta: "MiPOS" },
  { id: "transferencia", nombre: "Transferencia", etiqueta: "TRANSFERENCIA" },
] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number]["id"];
export const esFormaPago = (v: unknown): v is FormaPago => FORMAS_PAGO.some((f) => f.id === v);

/** Los motivos de un pospuesto o fallido, de lo que los repartidores anotan hoy en Despacho ciudad. */
export const MOTIVOS = ["No responde", "Me deja en visto", "No está en casa", "Pidió otra fecha", "No lo quiso", "Dirección incompleta", "Producto equivocado"] as const;

/** El nombre del repartidor sin espacios de más ni mayúsculas distintas («YOSELYN    VIAÑA» = «Yoselyn Viaña»). */
export const nombreRepartidor = (t: string | null | undefined) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/** La forma de pago guardada, en una sola grafía («MiPOS.» y «MIPOS» = MIPOS). */
export const formaNormal = (t: string | null | undefined) => (t ?? "").replace(/\./g, "").trim().toUpperCase();

const NOMBRES_FORMA: Record<string, string> = { EFECTIVO: "Efectivo", YAPPY: "Yappy", MIPOS: "MiPOS", TRANSFERENCIA: "Transf." };

/** La tienda como se lee en el panel («NUVO» → «Nuvo», «CLICKSI» → «ClickSi»). */
export function tituloTienda(t: string | null | undefined): string {
  const n = (t ?? "").trim().toUpperCase();
  if (!n) return "Sin tienda";
  if (n === "CLICKSI") return "ClickSi";
  return n.charAt(0) + n.slice(1).toLowerCase();
}

export interface FilaPanel {
  tienda: string | null;
  estado: string | null;
  formaPago: string | null;
  porCobrar: number | null;
  cobrado: number | null;
  costeEnvio: number | null;
  /** Cuántas fotos tiene (comprobante del pago o evidencia del fallido). */
  comprobantes: number;
}

export interface ResumenCierre {
  pedidos: number;
  enRuta: number;
  entregados: number;
  pospuestos: number;
  fallidos: number;
  fallidosConEvidencia: number;
  efectivo: { tienda: string; pedidos: number; monto: number }[];
  efectivoTotal: number;
  digitales: { tienda: string; detalle: string; monto: number }[];
  digitalesTotal: number;
  digitalesPedidos: number;
  digitalesConComprobante: number;
  pago: { pedidos: number; monto: number; tarifa: number | null };
}

const redondo = (n: number) => Math.round(n * 100) / 100;

/**
 * El cierre del día del repartidor. Lo cobrado de un entregado es «$ Cobrado» y, si no se anotó (los de Yappy de Monday), lo que había por cobrar.
 * El efectivo y lo digital van por tienda (cada tienda se deposita aparte). Se pagan los entregados y los fallidos con evidencia (alguna foto), cada uno
 * con su coste de envío; `tarifa` es el coste si todos los pagados tienen el mismo.
 */
export function resumenCierre(filas: FilaPanel[]): ResumenCierre {
  const r: ResumenCierre = {
    pedidos: filas.length,
    enRuta: 0,
    entregados: 0,
    pospuestos: 0,
    fallidos: 0,
    fallidosConEvidencia: 0,
    efectivo: [],
    efectivoTotal: 0,
    digitales: [],
    digitalesTotal: 0,
    digitalesPedidos: 0,
    digitalesConComprobante: 0,
    pago: { pedidos: 0, monto: 0, tarifa: null },
  };
  const efectivo = new Map<string, { pedidos: number; monto: number }>();
  const digitales = new Map<string, Map<string, { pedidos: number; monto: number }>>();
  const tarifas = new Set<number>();
  for (const f of filas) {
    const estado = (f.estado ?? "").toUpperCase();
    const seccion = seccionDe(estado);
    if (seccion === "ruta") r.enRuta++;
    if (estado === "POSPUESTO") r.pospuestos++;
    if (estado === "FALLIDO") {
      r.fallidos++;
      if (f.comprobantes > 0) r.fallidosConEvidencia++;
    }
    const pagado = estado === "ENTREGADO" || (estado === "FALLIDO" && f.comprobantes > 0);
    if (pagado) {
      r.pago.pedidos++;
      r.pago.monto += f.costeEnvio ?? 0;
      tarifas.add(f.costeEnvio ?? 0);
    }
    if (estado !== "ENTREGADO") continue;
    r.entregados++;
    const monto = f.cobrado ?? f.porCobrar ?? 0;
    const tienda = tituloTienda(f.tienda);
    const forma = formaNormal(f.formaPago);
    if (forma === "EFECTIVO" || !forma) {
      const e = efectivo.get(tienda) ?? { pedidos: 0, monto: 0 };
      e.pedidos++;
      e.monto += monto;
      efectivo.set(tienda, e);
      r.efectivoTotal += monto;
    } else {
      const porForma = digitales.get(tienda) ?? new Map<string, { pedidos: number; monto: number }>();
      const d = porForma.get(forma) ?? { pedidos: 0, monto: 0 };
      d.pedidos++;
      d.monto += monto;
      porForma.set(forma, d);
      digitales.set(tienda, porForma);
      r.digitalesTotal += monto;
      r.digitalesPedidos++;
      if (f.comprobantes > 0) r.digitalesConComprobante++;
    }
  }
  r.efectivo = [...efectivo.entries()].map(([tienda, e]) => ({ tienda, pedidos: e.pedidos, monto: redondo(e.monto) })).sort((a, b) => b.monto - a.monto);
  r.digitales = [...digitales.entries()]
    .map(([tienda, porForma]) => ({
      tienda,
      detalle: [...porForma.entries()].map(([forma, d]) => `${NOMBRES_FORMA[forma] ?? forma} ${d.pedidos}`).join(" · "),
      monto: redondo([...porForma.values()].reduce((t, d) => t + d.monto, 0)),
    }))
    .sort((a, b) => b.monto - a.monto);
  r.efectivoTotal = redondo(r.efectivoTotal);
  r.digitalesTotal = redondo(r.digitalesTotal);
  r.pago.monto = redondo(r.pago.monto);
  r.pago.tarifa = tarifas.size === 1 ? [...tarifas][0] : null;
  return r;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** «Lunes 23/11» de un día AAAA-MM-DD. */
export function diaLargo(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** El día AAAA-MM-DD que cae `n` días después. */
export function sumarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Las fechas rápidas de un pospuesto: mañana y pasado mañana («Mié 26/11»). */
export function fechasRapidas(hoy: string): { iso: string; texto: string }[] {
  const pasado = sumarDias(hoy, 2);
  return [
    { iso: sumarDias(hoy, 1), texto: "Mañana" },
    { iso: pasado, texto: `${diaLargo(pasado).slice(0, 3)} ${pasado.slice(8, 10)}/${pasado.slice(5, 7)}` },
  ];
}

/** Un monto como se lee en el panel: «$1,132.64». */
export const plata = (n: number | null | undefined) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El lunes de la semana de un día (la semana del panel va de lunes a domingo; cada lunes empieza de nuevo). */
export function inicioSemana(iso: string): string {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return sumarDias(iso, -((dia + 6) % 7));
}

/**
 * Los días que el repartidor puede ver (24 nov 2026, pedido de Hernán: «que vean lo de la semana en curso y al iniciar los lunes se les quite lo de la
 * semana pasada»): de lunes a hoy. `marca`: si ese día todavía se puede marcar (hoy y los dos anteriores, sin salir de la semana).
 */
export function diasDeLaSemana(hoy: string): { iso: string; texto: string; hoy: boolean; marca: boolean }[] {
  const dias: { iso: string; texto: string; hoy: boolean; marca: boolean }[] = [];
  for (let d = inicioSemana(hoy); d <= hoy; d = sumarDias(d, 1)) {
    dias.push({ iso: d, texto: d === hoy ? "Hoy" : `${diaLargo(d).slice(0, 3)} ${d.slice(8, 10)}`, hoy: d === hoy, marca: puedeMarcar(d, hoy) });
  }
  return dias;
}

/** Si un día se puede marcar desde el panel: hoy y los dos anteriores, sin salir de la semana en curso. */
export function puedeMarcar(dia: string, hoy: string): boolean {
  const desde = [inicioSemana(hoy), sumarDias(hoy, -2)].sort().at(-1)!;
  return dia >= desde && dia <= hoy;
}

/** El día que mira el panel: el pedido si es de la semana en curso (de lunes a hoy); si no, hoy. */
export function diaVisible(pedido: unknown, hoy: string): string {
  return typeof pedido === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pedido) && pedido <= hoy && pedido >= inicioSemana(hoy) ? pedido : hoy;
}
