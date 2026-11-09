// El recibo de un cierre pagado: el mismo texto que la hoja «RECIBOS DE PAGOS» (recibo de servicios de delivery
// independiente). Lógica pura; prueba en `recibo.test.ts`.

import { redondear } from "./liquidacion";

/** Quien paga (encabezado de los recibos de la hoja). */
/**
 * La empresa que paga, como sale en el recibo. Se lee de las variables de entorno del servidor (`RECIBO_EMPRESA_NOMBRE`,
 * `RECIBO_EMPRESA_RUC`) para no dejar la razón social ni el RUC en el repositorio. Solo se usa en el servidor.
 */
export const EMPRESA_RECIBO = {
  get nombre(): string {
    return process.env.RECIBO_EMPRESA_NOMBRE?.trim() || "Empresa";
  },
  get ruc(): string | null {
    return process.env.RECIBO_EMPRESA_RUC?.trim() || null;
  },
};

const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function menorDeMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const resto = r < 30 ? UNIDADES[r] : `${DECENAS[Math.floor(r / 10)]}${r % 10 ? ` y ${UNIDADES[r % 10]}` : ""}`;
  return [CENTENAS[c], resto].filter(Boolean).join(" ");
}

/** «uno» delante de un sustantivo: «un», «veintiún». */
const apocopar = (s: string) => s.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");

/** 164 → «ciento sesenta y cuatro»; 1001 → «mil uno»; 2 000 000 → «dos millones». */
export function enteroEnLetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1e9) throw new Error("Fuera de rango");
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? "un millón" : `${apocopar(menorDeMil(millones))} millones`);
  if (miles) partes.push(miles === 1 ? "mil" : `${apocopar(menorDeMil(miles))} mil`);
  if (resto) partes.push(menorDeMil(resto));
  return partes.join(" ");
}

/** 164.25 → «ciento sesenta y cuatro dólares con 25/100». */
export function montoEnLetras(monto: number): string {
  const m = redondear(Math.abs(monto));
  const entero = Math.floor(m);
  const centavos = Math.round((m - entero) * 100);
  const letras = apocopar(enteroEnLetras(entero));
  return `${letras} ${entero === 1 ? "dólar" : "dólares"} con ${String(centavos).padStart(2, "0")}/100`;
}

export interface DatosRecibo {
  numero: number;
  tipo: "pago" | "rendicion";
  nombre: string;
  documento: string | null;
  empresa: string;
  empresaRuc: string | null;
  monto: number;
  fechaPago: string;
  metodo: "transferencia" | "efectivo" | "yappy";
  referencia: string | null;
  periodoTexto: string;
}

/** «0007». */
export const numeroRecibo = (n: number) => String(n).padStart(4, "0");

/** «15/10/2026». */
export const fechaRecibo = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Los párrafos del recibo, en orden. */
export function parrafosRecibo(d: DatosRecibo): { declaracion: string; concepto: string; aclaracion: string | null } {
  const identidad = d.documento ? `, portador(a) de cédula/pasaporte N.º ${d.documento}` : "";
  const empresa = d.empresaRuc ? `${d.empresa}, RUC ${d.empresaRuc}` : d.empresa;
  if (d.tipo === "rendicion") {
    return {
      declaracion: `Yo, ${d.nombre}${identidad}, declaro haber entregado a la empresa ${empresa} la suma de:`,
      concepto: `Efectivo cobrado contra entrega por encima de lo que me corresponde por mis servicios de delivery, correspondiente al período del ${d.periodoTexto}.`,
      aclaracion: null,
    };
  }
  return {
    declaracion: `Yo, ${d.nombre}${identidad}, declaro haber recibido de la empresa ${empresa} la suma de:`,
    concepto: `Pago por servicios de delivery prestados como trabajador independiente, correspondientes al período del ${d.periodoTexto}.`,
    aclaracion: "El presente pago no constituye salario ni genera relación laboral, prestaciones ni derechos conforme al Código de Trabajo de la República de Panamá.",
  };
}
