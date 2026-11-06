"use client";

/** Imprimir o guardar como PDF: el navegador abre su ventana de impresión. */
export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
      Imprimir o guardar PDF
    </button>
  );
}
