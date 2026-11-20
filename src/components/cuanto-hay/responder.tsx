"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepararFotosCuantoHay, quitarFotoCuantoHay, registrarFotosCuantoHay, responderCuantoHay } from "@/app/(app)/inventario-pedidos-despacho/cuanto-hay/actions";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { supabase } from "@/lib/supabase/client";
import { BUCKET_FOTOS_CUANTO_HAY, MAX_BYTES_FOTO, MAX_FOTOS_POR_PEDIDO, MAX_FOTOS_POR_SUBIDA, cuandoCorto, type PreguntaCuantoHay } from "@/lib/cuanto-hay/reglas";

/**
 * Una fila: quién pidió (su nombre y, debajo, cuándo), la cantidad en su propia columna con «Responder» al lado (en Respondidas, la cantidad dada
 * y se puede corregir) y quién respondió en otra columna (19 nov 2026, pedido de Hernán: que se vea claro quién pidió y el número solo).
 */
function Fila({ p, puedeResponder, ahora }: { p: PreguntaCuantoHay; puedeResponder: boolean; ahora: Date }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [cantidad, setCantidad] = useState(p.cantidad === null ? "" : String(p.cantidad));
  const [enviando, iniciar] = useTransition();
  const responder = () =>
    iniciar(async () => {
      const r = await responderCuantoHay(p.id, cantidad).catch(() => ({ error: "No se pudo guardar la respuesta." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(`Listo: le llegó a ${p.pedidoPorNombre ?? "quien preguntó"}.${r.inventario?.ok ? ` ${r.inventario.texto}` : ""}`);
      // Si el inventario no se pudo ajustar, se avisa aparte: la respuesta ya se guardó.
      if (r.inventario && !r.inventario.ok) mostrarToast(r.inventario.texto, "destructive");
      router.refresh();
    });
  const cambio = p.cantidad === null ? cantidad.trim() !== "" : cantidad.trim() !== String(p.cantidad);
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-2 font-medium">{p.producto}</td>
      <td className="px-2 py-2 text-muted-foreground">{p.nota ?? "—"}</td>
      <td className="px-2 py-2">
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{p.pedidoPorNombre ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{cuandoCorto(p.creadoEn, ahora)}</span>
        </span>
      </td>
      <td className="px-2 py-2">
        {puedeResponder ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (cambio) responder();
            }}
          >
            <label>
              <span className="sr-only">Cantidad de {p.producto}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
                className={`${fieldClass} w-24 text-right tabular-nums`}
              />
            </label>
            <button type="submit" disabled={enviando || !cambio} className="inline-flex min-h-9 items-center rounded-md bg-primario px-3 text-sm font-semibold text-white disabled:opacity-50">
              {enviando ? "…" : p.cantidad === null ? "Responder" : "Corregir"}
            </button>
          </form>
        ) : (
          <span className="text-base font-bold tabular-nums">{p.cantidad ?? "—"}</span>
        )}
      </td>
      <td className="px-4 py-2">
        {p.respondidoEn ? (
          <span className="flex flex-col leading-tight">
            <span>{p.respondidoPorNombre ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{cuandoCorto(p.respondidoEn, ahora)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Una petición de fotos reales (20 nov 2026): en vez de la cantidad, «Subir fotos» (varias a la vez, desde el celular o el computador) con sus miniaturas; cada una se puede ver en grande o quitar si se subió por error.
 * Las fotos suben directo al almacén y el servidor revisa cada archivo por su contenido.
 */
function FilaFotos({ p, puedeResponder, ahora }: { p: PreguntaCuantoHay; puedeResponder: boolean; ahora: Date }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ url: string; alt: string } | null>(null);
  const [quitando, iniciar] = useTransition();

  const subir = async (lista: FileList | null) => {
    const archivos = Array.from(lista ?? []);
    if (entrada.current) entrada.current.value = "";
    if (!archivos.length) return;
    const buenos = archivos.filter((f) => f.size > 0 && f.size <= MAX_BYTES_FOTO && (f.type === "" || f.type.startsWith("image/")));
    if (buenos.length < archivos.length) mostrarToast(`${archivos.length - buenos.length} archivo(s) no se subieron: solo fotos de hasta 15 MB.`, "destructive");
    if (!buenos.length) return;
    if (p.fotos.length + buenos.length > MAX_FOTOS_POR_PEDIDO) return mostrarToast(`Una petición admite hasta ${MAX_FOTOS_POR_PEDIDO} fotos (ya tiene ${p.fotos.length}).`, "destructive");
    let subidas = 0;
    for (let i = 0; i < buenos.length; i += MAX_FOTOS_POR_SUBIDA) {
      const lote = buenos.slice(i, i + MAX_FOTOS_POR_SUBIDA);
      setSubiendo(`Subiendo ${Math.min(i + lote.length, buenos.length)} de ${buenos.length}…`);
      const permiso = await prepararFotosCuantoHay(p.id, lote.map((f) => f.name)).catch(() => ({ error: "No se pudo preparar la subida." }));
      if ("error" in permiso) {
        mostrarToast(permiso.error, "destructive");
        break;
      }
      const rutas: string[] = [];
      for (let k = 0; k < lote.length; k++) {
        const { error } = await supabase.storage.from(BUCKET_FOTOS_CUANTO_HAY).uploadToSignedUrl(permiso.permisos[k].ruta, permiso.permisos[k].token, lote[k], { contentType: lote[k].type || "image/jpeg" });
        if (!error) rutas.push(permiso.permisos[k].ruta);
      }
      if (!rutas.length) {
        mostrarToast("No se pudieron subir las fotos. Revisa la conexión e inténtalo de nuevo.", "destructive");
        break;
      }
      const r = await registrarFotosCuantoHay(p.id, rutas).catch(() => ({ error: "No se pudieron guardar las fotos." }));
      if ("error" in r) {
        mostrarToast(r.error, "destructive");
        break;
      }
      subidas += r.fotos;
    }
    setSubiendo(null);
    if (subidas) mostrarToast(`Listo: ${subidas === 1 ? "1 foto" : `${subidas} fotos`}. Le llegó a ${p.pedidoPorNombre ?? "quien las pidió"}.`);
    router.refresh();
  };

  const quitar = (id: string) =>
    iniciar(async () => {
      const r = await quitarFotoCuantoHay(id).catch(() => ({ error: "No se pudo quitar la foto." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      router.refresh();
    });

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-2 font-medium">
        {p.producto}
        <span className="ml-2 rounded-full bg-primario-suave px-2 py-0.5 text-xs font-medium text-primario">Fotos reales</span>
        {p.pais && <span className="ml-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">{p.pais}</span>}
      </td>
      <td className="px-2 py-2 text-muted-foreground">{p.nota ?? "—"}</td>
      <td className="px-2 py-2">
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{p.pedidoPorNombre ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{cuandoCorto(p.creadoEn, ahora)}</span>
        </span>
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-col gap-2">
          {p.fotos.length > 0 && (
            <ul role="list" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {p.fotos.map((f, i) => (
                <li key={f.id} className="relative">
                  <button type="button" onClick={() => setFoto({ url: f.url, alt: `Foto ${i + 1} de ${p.producto}` })} aria-label={`Ver la foto ${i + 1} de ${p.producto}`} className={`block overflow-hidden rounded-md border border-border ${anilloFoco}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto real firmada del almacén */}
                    <img src={f.url} alt="" loading="lazy" className="h-14 w-14 object-cover" />
                  </button>
                  {puedeResponder && (
                    <button type="button" onClick={() => quitar(f.id)} disabled={quitando} aria-label={`Quitar la foto ${i + 1} de ${p.producto}`} className={`absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground shadow-sm hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {puedeResponder ? (
            <div className="flex flex-wrap items-center gap-2">
              <input ref={entrada} type="file" accept="image/*" multiple className="sr-only" id={`fotos-${p.id}`} aria-label={`Fotos de ${p.producto}`} onChange={(e) => void subir(e.target.files)} disabled={!!subiendo} />
              <button type="button" onClick={() => entrada.current?.click()} disabled={!!subiendo} className={`inline-flex min-h-9 items-center rounded-md bg-primario px-3 text-sm font-semibold text-white disabled:opacity-50 ${anilloFoco}`}>
                {subiendo ?? (p.fotos.length ? "Subir más fotos" : "Subir fotos")}
              </button>
            </div>
          ) : (
            p.fotos.length === 0 && <span className="text-muted-foreground">—</span>
          )}
        </div>
        <VisorImagen src={foto?.url ?? null} alt={foto?.alt} onClose={() => setFoto(null)} />
      </td>
      <td className="px-4 py-2">
        {p.respondidoEn ? (
          <span className="flex flex-col leading-tight">
            <span>{p.respondidoPorNombre ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{cuandoCorto(p.respondidoEn, ahora)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

/** El panel de Yiletsi (16 nov 2026): una tabla con un renglón por tienda y debajo sus preguntas, la más vieja primero. */
export function ResponderCuantoHay({
  grupos,
  respondidas,
  puedeResponder,
}: {
  grupos: { tienda: { id: string; nombre: string }; preguntas: PreguntaCuantoHay[] }[];
  respondidas: boolean;
  puedeResponder: boolean;
}) {
  const ahora = new Date();
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="border-b border-border px-4 py-2 font-medium">Producto</th>
              <th className="border-b border-border px-2 py-2 font-medium">Nota</th>
              <th className="border-b border-border px-2 py-2 font-medium">Pidió</th>
              <th className="border-b border-border px-2 py-2 font-medium">Cantidad o fotos</th>
              <th className="border-b border-border px-4 py-2 font-medium">Respondió</th>
            </tr>
          </thead>
          <tbody>
            {grupos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {respondidas ? "No hay respuestas en los últimos 7 días." : "No hay preguntas pendientes."}
                </td>
              </tr>
            ) : (
              grupos.flatMap((g) => [
                <tr key={`t-${g.tienda.id}`} className="bg-primario-suave">
                  <th colSpan={5} scope="colgroup" className="px-4 py-1.5 text-left font-bold text-primario">
                    {g.tienda.nombre} · {g.preguntas.length}
                  </th>
                </tr>,
                ...g.preguntas.map((p) => (p.tipo === "fotos" ? <FilaFotos key={`${p.id}-${p.fotos.length}`} p={p} puedeResponder={puedeResponder} ahora={ahora} /> : <Fila key={`${p.id}-${p.cantidad ?? ""}`} p={p} puedeResponder={puedeResponder} ahora={ahora} />)),
              ])
            )}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-xs text-muted-foreground">Al responder o subir las fotos, le llega el aviso a quien lo pidió (en «Para ti») y pasa a «Respondidas».</p>
    </div>
  );
}
