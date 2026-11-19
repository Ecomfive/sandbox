"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { preguntarCuantoHay } from "@/app/(app)/inventario-pedidos-despacho/cuanto-hay/actions";
import { fieldClass } from "@/components/ui/field";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { cuandoCorto, type PreguntaCuantoHay } from "@/lib/cuanto-hay/reglas";

/**
 * Comunicación despacho › Cuánto hay (16 nov 2026): una línea para preguntar («Para»: Proveeduría o la tienda, si hay más de una; producto del
 * catálogo y una nota) y debajo **solo las preguntas de la persona** (19 nov 2026). «Cantidad» lleva solo el número (o «Esperando a Yiletsi») y
 * «Respondió», quién y cuándo, en su propia columna.
 */
export function PreguntarCuantoHay({
  tiendas,
  opciones,
  preguntas,
  puedePreguntar,
  verTienda,
}: {
  tiendas: { id: string; nombre: string }[];
  opciones: OpcionSkuMaestro[];
  preguntas: PreguntaCuantoHay[];
  puedePreguntar: boolean;
  /** Si maneja más de una tienda, se elige; con una, va fija. */
  verTienda: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [tiendaId, setTiendaId] = useState(tiendas[0]?.id ?? "");
  const [sku, setSku] = useState<OpcionSkuMaestro | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, iniciar] = useTransition();

  const preguntar = () =>
    iniciar(async () => {
      if (!sku) return mostrarToast("Elige el producto de la lista.", "destructive");
      const r = await preguntarCuantoHay(tiendaId, sku.id, nota).catch(() => ({ error: "No se pudo enviar la pregunta." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast("Listo: le llegó a Yiletsi. Te avisa en «Para ti» cuando responda.");
      setSku(null);
      setNota("");
      router.refresh();
    });

  const tiendaFija = tiendas.length === 1 ? tiendas[0] : null;
  const ahora = new Date();

  return (
    <div className="flex flex-col gap-4">
      {tiendas.length === 0 ? (
        <p className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">No tienes tiendas asignadas para preguntar.</p>
      ) : (
        puedePreguntar && (
          <form
            className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              preguntar();
            }}
          >
            {verTienda ? (
              <label className="flex min-w-[140px] flex-col gap-1 text-sm">
                <span className="font-medium">Para</span>
                <select value={tiendaId} onChange={(e) => setTiendaId(e.target.value)} className={fieldClass}>
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              tiendaFija && <span className="mb-2 rounded-md bg-primario-suave px-2.5 py-1 text-sm font-semibold text-primario">{tiendaFija.nombre}</span>
            )}
            <div className="flex min-w-[260px] flex-[1_1_300px] flex-col gap-1 text-sm">
              <span className="font-medium" id="cuanto-hay-producto">
                Producto
              </span>
              <ProveedorSkusMaestros opciones={opciones}>
                <CampoSkuMaestro valor={sku?.id ?? null} alCambiar={setSku} etiquetaAria="Producto" placeholder="Escribe parte del nombre, el SKU o el N.º" claseContenedor="w-full" />
              </ProveedorSkusMaestros>
            </div>
            <label className="flex min-w-[220px] flex-[2_1_320px] flex-col gap-1 text-sm">
              <span className="font-medium">
                Nota <span className="font-normal text-muted-foreground">(opcional)</span>
              </span>
              <input type="text" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: es para un cambio, cliente esperando" className={fieldClass} />
            </label>
            <button
              type="submit"
              disabled={enviando || !sku || !tiendaId}
              className="inline-flex min-h-10 items-center rounded-md bg-primario px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Preguntar"}
            </button>
          </form>
        )
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="border-b border-border px-4 py-2 font-medium">Producto</th>
              {verTienda && <th className="border-b border-border px-2 py-2 font-medium">Para</th>}
              <th className="border-b border-border px-2 py-2 font-medium">Nota</th>
              <th className="border-b border-border px-2 py-2 font-medium">Preguntaste</th>
              <th className="border-b border-border px-2 py-2 text-right font-medium">Cantidad</th>
              <th className="border-b border-border px-4 py-2 font-medium">Respondió</th>
            </tr>
          </thead>
          <tbody>
            {preguntas.length === 0 ? (
              <tr>
                <td colSpan={verTienda ? 6 : 5} className="px-4 py-6 text-center text-muted-foreground">
                  Todavía no has preguntado nada.
                </td>
              </tr>
            ) : (
              preguntas.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">{p.producto}</td>
                  {verTienda && <td className="px-2 py-2.5">{p.tienda}</td>}
                  <td className="px-2 py-2.5 text-muted-foreground">{p.nota ?? "—"}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap text-muted-foreground">{cuandoCorto(p.creadoEn, ahora)}</td>
                  <td className="px-2 py-2.5 text-right">
                    {p.cantidad === null ? (
                      <span className="text-xs whitespace-nowrap text-muted-foreground">Esperando a Yiletsi</span>
                    ) : (
                      <span className="text-base font-bold text-primario tabular-nums">{p.cantidad.toLocaleString("es-PA")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.respondidoEn ? (
                      <span className="flex flex-col leading-tight">
                        <span>{p.respondidoPorNombre ?? "Despacho"}</span>
                        <span className="text-xs text-muted-foreground">{cuandoCorto(p.respondidoEn, ahora)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-xs text-muted-foreground">Aquí ves solo lo que tú preguntaste, de los últimos 60 días. Cuando Yiletsi responde, te llega el aviso en «Para ti».</p>
    </div>
  );
}
