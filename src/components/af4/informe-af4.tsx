import Image from "next/image";
import type { ReactNode } from "react";

// Piezas de un informe ejecutivo imprimible del Portal AF4 360° (el Informe mensual; sirven para otro informe que se
// imprima o se guarde en PDF): la portada, las secciones numeradas y las reglas de impresión. En pantalla la portada no
// se ve (la barra de contexto ya dice el mes); al imprimir es la primera hoja.

/**
 * Reglas de impresión de un informe AF4: hoja A4 con márgenes, pie con el nombre del informe y el número de página
 * (donde el navegador lo admite), colores del tema claro aunque la persona use el oscuro, los puntos de color se
 * imprimen, y ninguna tabla, tarjeta ni título de sección se corta entre dos hojas. Se aplica solo dentro de `.informe-af4`.
 */
function reglasImpresion(pie: string): string {
  const pieSeguro = pie.replace(/["\\\n\r]/g, " ");
  return `
@media print {
  @page { size: A4; margin: 16mm 14mm 18mm 14mm;
    @bottom-left { content: "${pieSeguro}"; font: 8pt system-ui, sans-serif; color: #636363; }
    @bottom-right { content: counter(page) " / " counter(pages); font: 8pt system-ui, sans-serif; color: #636363; }
  }
  @page :first { @bottom-left { content: none; } @bottom-right { content: none; } }
  .informe-af4 {
    --background: #ffffff; --foreground: #18181b; --card: #ffffff; --muted: #f4f3f7; --muted-foreground: #5a5a5a;
    --foreground-soft: #3f3f46; --border: #d9d9d9; --border-control: #8a8a8a; --success: #15803d; --warning: #b45309;
    --destructive: #be123c; --accent: #efe8fb; --accent-foreground: #3b1d5a; --primario: #8a35c9;
    --grafica-1: #52525b; --grafica-2: #8a35c9; --grafica-3: #0e7490; --grafica-4: #b45309; --grafica-5: #7c7c85;
    color: var(--foreground); background: #ffffff; padding: 0 !important; max-width: none !important; gap: 7mm !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .informe-af4 section section, .informe-af4 .break-inside-avoid, .informe-af4 tr, .informe-af4 li { break-inside: avoid; }
  .informe-af4 thead { display: table-header-group; }
  .informe-af4 h2, .informe-af4 h3 { break-after: avoid; }
  .informe-af4 [role="region"] { overflow: visible !important; }
  .informe-af4 a { color: inherit; text-decoration: none; }
}`;
}

/** Las reglas de impresión del informe, como un `<style>` dentro de la página (no tocan el resto del portal). */
export function EstiloImpresionAF4({ pie }: { pie: string }) {
  return <style>{reglasImpresion(pie)}</style>;
}

/**
 * La portada impresa: la marca Ecomfive y «Portal AF4 360°» arriba, el nombre del informe y el período grandes, el
 * índice de las secciones y, abajo, cuándo se preparó. Ocupa la primera hoja entera y solo se ve al imprimir.
 */
export function PortadaInformeAF4({
  titulo,
  periodo,
  comparacion,
  indice,
  preparado,
  datos,
}: {
  /** «Informe financiero mensual». */
  titulo: string;
  /** «Septiembre de 2026». */
  periodo: string;
  /** «Comparado con agosto de 2026 · USD». */
  comparacion?: string;
  /** Los títulos de las secciones, en orden. */
  indice: string[];
  /** «23 oct 2026». */
  preparado: string;
  /** Datos de la ficha de la portada (Presupuesto, Múltiplo…), etiqueta → valor. */
  datos?: { etiqueta: string; valor: string }[];
}) {
  return (
    <div aria-hidden="true" className="hidden min-h-[257mm] flex-col justify-between break-after-page print:flex">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <Image src="/brand/ecomfive-negro.png" alt="" width={161} height={44} className="h-7 w-auto" priority={false} />
        <p className="text-[10pt] font-semibold tracking-[0.02em] text-foreground-soft">Portal AF4 360°</p>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-[11pt] font-medium text-muted-foreground">{titulo}</p>
        <p className="text-[34pt] leading-[1.05] font-semibold tracking-[-0.02em] text-foreground first-letter:uppercase">{periodo}</p>
        {comparacion && <p className="text-[11pt] text-foreground-soft">{comparacion}</p>}
        <ol className="mt-8 flex max-w-[110mm] flex-col border-t border-border">
          {indice.map((t, i) => (
            <li key={t} className="flex items-baseline gap-4 border-b border-border py-2.5 text-[11pt]">
              <span className="w-5 text-right font-semibold text-primario tabular-nums">{i + 1}</span>
              <span className="text-foreground">{t}</span>
            </li>
          ))}
        </ol>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border pt-5 text-[9pt] sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Preparado</dt>
          <dd className="font-medium text-foreground">{preparado}</dd>
        </div>
        {(datos ?? []).map((d) => (
          <div key={d.etiqueta}>
            <dt className="text-muted-foreground">{d.etiqueta}</dt>
            <dd className="font-medium text-foreground">{d.valor}</dd>
          </div>
        ))}
        <div>
          <dt className="text-muted-foreground">Uso</dt>
          <dd className="font-medium text-foreground">Confidencial · dirección</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Una sección numerada del informe: el número en el color de la marca, el título y, en gris, de qué es («sep 26 vs
 * ago 26 · USD»). El número sí lleva información: el informe se lee en orden (qué pasó, por qué, qué significa, qué hacer).
 */
export function SeccionInformeAF4({
  id,
  numero,
  titulo,
  detalle,
  children,
}: {
  id: string;
  numero: number;
  titulo: string;
  detalle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border pb-2">
        <span className="text-base font-semibold text-primario tabular-nums">{numero}</span>
        <span className="text-base font-semibold tracking-tight text-foreground">{titulo}</span>
        {detalle && <span className="text-xs font-normal text-muted-foreground">{detalle}</span>}
      </h2>
      {children}
    </section>
  );
}
