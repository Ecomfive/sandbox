"use client";

import { useId, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { fieldClassSm } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { leerLista, type LineaImportada } from "@/lib/wms/levantamiento";
import { sugerirProductosParaLista, type SugerenciaLinea } from "./actions";

interface ProductoLista {
  id: string;
  codigo: string;
  nombre: string;
  manejaVencimiento: boolean;
}

const ETIQUETA = (p: { codigo: string; nombre: string }) => `${p.codigo} — ${p.nombre}`;

/**
 * «Importar lista»: pegar o subir una lista «producto;cantidad» (por ejemplo, el inventario que había en ClickUp) para llenar
 * la columna «Contado» del levantamiento. Cada línea trae el producto que el sistema encontró (seguro, a revisar o sin
 * producto) y se puede cambiar escribiendo su SKU o su nombre. No guarda nada: solo llena el levantamiento, que se revisa y
 * se guarda como siempre. Un producto con vencimiento no se puede cargar así (pide lotes).
 */
export function ImportarLista({ productos, alAplicar, deshabilitado }: { productos: ProductoLista[]; alAplicar: (cantidades: Record<string, number>) => void; deshabilitado: boolean }) {
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [lineas, setLineas] = useState<(LineaImportada & SugerenciaLinea & { escrito: string })[] | null>(null);
  const [saltadas, setSaltadas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const porId = new Map(productos.map((p) => [p.id, p]));
  const porEtiqueta = new Map(productos.map((p) => [ETIQUETA(p).toLowerCase(), p]));
  const porCodigo = new Map(productos.map((p) => [p.codigo.toLowerCase(), p]));

  const cerrar = () => {
    setAbierto(false);
    setLineas(null);
    setTexto("");
    setError(null);
  };

  const leer = () => {
    setError(null);
    const { lineas: leidas, saltadas: s } = leerLista(texto);
    if (leidas.length === 0) {
      setError("No se encontró ninguna línea con «producto;cantidad».");
      return;
    }
    startTransition(async () => {
      const r = await sugerirProductosParaLista(leidas.map((l) => l.nombre));
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSaltadas(s);
      setLineas(
        leidas.map((l, i) => {
          const sug = r.sugerencias[i];
          const p = sug.skuId ? porId.get(sug.skuId) : undefined;
          return { ...l, ...sug, escrito: p ? ETIQUETA(p) : "" };
        }),
      );
    });
  };

  const elegir = (i: number, escrito: string) =>
    setLineas((ls) =>
      (ls ?? []).map((l, j) => {
        if (j !== i) return l;
        const t = escrito.trim().toLowerCase();
        const p = porEtiqueta.get(t) ?? porCodigo.get(t.split(" — ")[0]);
        return { ...l, escrito, skuId: p?.id ?? null, estado: p ? "seguro" : "sin" };
      }),
    );

  const conProducto = (lineas ?? []).filter((l) => l.skuId && !porId.get(l.skuId)?.manejaVencimiento);
  const conLotes = (lineas ?? []).filter((l) => l.skuId && porId.get(l.skuId)?.manejaVencimiento).length;
  const sinProducto = (lineas ?? []).filter((l) => !l.skuId).length;
  const aRevisar = (lineas ?? []).filter((l) => l.estado === "revisar").length;

  const aplicar = () => {
    const suma: Record<string, number> = {};
    for (const l of conProducto) suma[l.skuId!] = (suma[l.skuId!] ?? 0) + l.cantidad;
    alAplicar(suma);
    cerrar();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={deshabilitado}
        className="min-h-9 rounded-md border border-border-control bg-card px-3 text-sm hover:bg-muted disabled:opacity-60"
      >
        Importar lista
      </button>
      <Ventana abierto={abierto} alCerrar={cerrar} titulo={<span className="text-lg font-semibold">Importar lista al levantamiento</span>} ancho="lg">
        <div className="flex flex-col gap-4 p-5">
          {!lineas ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Lista (una línea por producto: nombre o SKU ; cantidad)</span>
                <textarea
                  data-enfocar
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={10}
                  placeholder={"Ej:\nAceite de Batana;850\nLEMME/BURN;3208"}
                  className={`${fieldClassSm} w-full resize-y font-mono`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">O sube un archivo .csv o .txt</span>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={async (e) => {
                    const archivo = e.target.files?.[0];
                    if (archivo) setTexto(await archivo.text());
                  }}
                  className="text-sm"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={leer}
                disabled={pendiente || texto.trim() === ""}
                className="min-h-10 self-end rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
              >
                {pendiente ? "Buscando productos…" : "Buscar los productos"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm">
                <strong className="tabular-nums">{lineas.length}</strong> líneas · <strong className="tabular-nums">{aRevisar}</strong> para revisar ·{" "}
                <strong className="tabular-nums">{sinProducto}</strong> sin producto
                {conLotes > 0 && (
                  <>
                    {" "}
                    · <strong className="tabular-nums">{conLotes}</strong> con vencimiento (se cuentan a mano, por lote)
                  </>
                )}
                {saltadas > 0 && <> · {saltadas} líneas sin cantidad saltadas</>}
              </p>
              <datalist id={idLista}>
                {productos.map((p) => (
                  <option key={p.id} value={ETIQUETA(p)} />
                ))}
              </datalist>
              <ul className="m-0 flex max-h-[55vh] list-none flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border p-0">
                {lineas.map((l, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block truncate font-medium">{l.nombre}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{l.cantidad.toLocaleString("es")} u.</span>
                    </span>
                    {l.estado === "seguro" ? <Badge tone="success">Seguro</Badge> : l.estado === "revisar" ? <Badge tone="warning">Revisar</Badge> : <Badge tone="destructive">Sin producto</Badge>}
                    <input
                      list={idLista}
                      aria-label={`Producto de «${l.nombre}»`}
                      value={l.escrito}
                      onChange={(e) => elegir(i, e.target.value)}
                      placeholder="Escribe el SKU o el nombre"
                      className={`${fieldClassSm} w-full basis-72`}
                    />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => setLineas(null)} className="min-h-10 rounded-md border border-border-control px-4 text-sm hover:bg-muted">
                  Volver
                </button>
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={conProducto.length === 0}
                  className="min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
                >
                  Pasar {conProducto.length} al levantamiento
                </button>
              </div>
            </>
          )}
        </div>
      </Ventana>
    </>
  );
}
