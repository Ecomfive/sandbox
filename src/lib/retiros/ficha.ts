// Datos de la ficha de un retiro ("formato factura") y los formatos de texto simples (CSV).
// El PDF y el Excel viven en ficha-pdf.ts y ficha-xlsx.ts y parten de estos mismos datos.

import { formatearFecha, formatearFechaHoraCompleta } from "@/lib/formato";

export interface FichaRetiro {
  correlativo: number;
  estado: string;
  plataforma: string;
  destino: string;
  destinoDetalle: string | null;
  pais: string;
  codigoPais: string;
  fecha: string;
  fechaLimite: string | null;
  asignado: string | null;
  estadoDropi: string | null;
  dropiId: number | null;
  monto: number;
  comision: number;
  aRecibir: number;
  montoRecibido: number | null;
  soporte: string | null;
  fechaCierre: string | null;
  notas: string | null;
  generadoPor: string;
  generadoEn: string;
}

export interface LineaFicha {
  campo: string;
  valor: string | number;
  monto?: boolean;
}

export const numeroRetiro = (correlativo: number) => `#${String(correlativo).padStart(4, "0")}`;

export function nombreArchivo(ficha: FichaRetiro, extension: string): string {
  return `retiro-${String(ficha.correlativo).padStart(4, "0")}.${extension}`;
}

export const destinoCompleto = (ficha: FichaRetiro) =>
  ficha.destinoDetalle ? `${ficha.destino} (${ficha.destinoDetalle})` : ficha.destino;

export const estadoDropiCompleto = (ficha: FichaRetiro) =>
  ficha.estadoDropi
    ? ficha.dropiId !== null
      ? `${ficha.estadoDropi} (Dropi #${ficha.dropiId})`
      : ficha.estadoDropi
    : "Sin vincular";

export const generadoTexto = (ficha: FichaRetiro) => formatearFechaHoraCompleta(ficha.generadoEn, ficha.codigoPais);

/** Líneas campo/valor de la ficha, en el orden en que se leen, para las salidas tipo tabla (Excel y CSV). */
export function lineasFicha(ficha: FichaRetiro): LineaFicha[] {
  const lineas: LineaFicha[] = [
    { campo: "Retiro", valor: numeroRetiro(ficha.correlativo) },
    { campo: "Estado", valor: ficha.estado },
    { campo: "País", valor: ficha.pais },
    { campo: "Plataforma", valor: ficha.plataforma },
    { campo: "Destino", valor: destinoCompleto(ficha) },
    { campo: "Persona asignada", valor: ficha.asignado ?? "Sin asignar" },
    { campo: "Fecha de creación", valor: formatearFecha(ficha.fecha) },
  ];
  if (ficha.fechaLimite) lineas.push({ campo: "Fecha límite", valor: formatearFecha(ficha.fechaLimite) });
  lineas.push({ campo: "Estado en Dropi", valor: estadoDropiCompleto(ficha) });
  lineas.push({ campo: "Monto del retiro", valor: ficha.monto, monto: true });
  lineas.push({ campo: "Comisión", valor: ficha.comision, monto: true });
  lineas.push({ campo: "A recibir", valor: ficha.aRecibir, monto: true });
  if (ficha.montoRecibido !== null) {
    lineas.push({ campo: "Monto recibido", valor: ficha.montoRecibido, monto: true });
    lineas.push({ campo: "Diferencia", valor: ficha.montoRecibido - ficha.aRecibir, monto: true });
  }
  if (ficha.fechaCierre) lineas.push({ campo: "Fecha de cierre", valor: formatearFecha(ficha.fechaCierre) });
  if (ficha.soporte) lineas.push({ campo: "N.º de soporte", valor: ficha.soporte });
  if (ficha.notas) lineas.push({ campo: "Notas", valor: ficha.notas });
  return lineas;
}

function celdaCsv(valor: string | number): string {
  const texto = typeof valor === "number" ? valor.toFixed(2) : valor;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** CSV con BOM para que Excel respete los acentos. */
export function fichaACsv(ficha: FichaRetiro): string {
  const filas = [
    ...lineasFicha(ficha),
    { campo: "Generado el", valor: generadoTexto(ficha) },
    { campo: "Generado por", valor: ficha.generadoPor },
  ];
  return "﻿" + ["Campo,Valor", ...filas.map((l) => `${celdaCsv(l.campo)},${celdaCsv(l.valor)}`)].join("\r\n") + "\r\n";
}
