// Reglas de impresión del paquete bancario: hoja A4 o Carta, encabezado con la empresa y «Cifras de gestión, no
// auditadas», pie con el corte y el número de página, una hoja nueva por sección, las tablas de 12 meses en una hoja
// apaisada, colores del tema claro y nada que se corte entre dos hojas. Solo dentro de `.paquete-bancario`.

export type Papel = "a4" | "carta";

export const leerPapel = (v: unknown): Papel => (v === "carta" ? "carta" : "a4");

const limpio = (t: string) => t.replace(/["\\\n\r]/g, " ");

export function EstiloPaquete({ papel, encabezado, pie }: { papel: Papel; encabezado: string; pie: string }) {
  const tamano = papel === "carta" ? "letter" : "A4";
  const css = `
@media print {
  @page { size: ${tamano}; margin: 18mm 14mm 18mm 14mm;
    @top-left { content: "${limpio(encabezado)}"; font: 8pt system-ui, sans-serif; color: #636363; }
    @top-right { content: "Cifras de gestión, no auditadas"; font: 8pt system-ui, sans-serif; color: #b45309; }
    @bottom-left { content: "${limpio(pie)}"; font: 8pt system-ui, sans-serif; color: #636363; }
    @bottom-right { content: counter(page) " / " counter(pages); font: 8pt system-ui, sans-serif; color: #636363; }
  }
  @page apaisada { size: ${tamano} landscape; }
  @page :first { @top-left { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }
  .paquete-bancario {
    --background: #ffffff; --foreground: #18181b; --card: #ffffff; --muted: #f4f3f7; --muted-foreground: #5a5a5a;
    --foreground-soft: #3f3f46; --border: #d9d9d9; --border-control: #8a8a8a; --success: #15803d; --warning: #b45309;
    --destructive: #be123c; --accent: #efe8fb; --accent-foreground: #3b1d5a; --primario: #8a35c9;
    color: var(--foreground); background: #ffffff; padding: 0 !important; max-width: none !important; gap: 6mm !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .paquete-bancario [data-sin-imprimir] { display: none !important; }
  .paquete-bancario .paquete-seccion { break-before: page; }
  .paquete-bancario .paquete-ancho { page: apaisada; }
  .paquete-bancario .paquete-ancho table { font-size: 7pt; }
  .paquete-bancario .break-inside-avoid, .paquete-bancario tr, .paquete-bancario li { break-inside: avoid; }
  .paquete-bancario thead { display: table-header-group; }
  .paquete-bancario h2, .paquete-bancario h3 { break-after: avoid; }
  .paquete-bancario [role="region"] { overflow: visible !important; }
  .paquete-bancario a { color: inherit; text-decoration: none; }
}`;
  return <style>{css}</style>;
}
