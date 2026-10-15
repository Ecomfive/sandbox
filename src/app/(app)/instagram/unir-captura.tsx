"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { sonDeContenidosDistintos, sugerirUniones, textoMinutos, type CapturaParaUnir } from "@/lib/instagram/unir";
import { EnlaceIcon } from "@/lib/nav-icons";
import { unirCapturas } from "./actions";
import { etiquetaFormatoInstagram, formatoDeCaptura, numeroInstagram, quienEnvio, type FilaInstagram } from "./def-instagram";

export const paraUnir = (f: FilaInstagram): CapturaParaUnir => ({ id: f.id, numero: f.numero, recibidoEn: f.recibidoEn, remitenteId: f.remitenteId, enlace: f.enlace, tieneArchivo: f.tieneArchivo });

const descripcion = (f: FilaInstagram) => `${numeroInstagram(f.numero)} · ${etiquetaFormatoInstagram(formatoDeCaptura(f))} · ${quienEnvio(f)}${f.titulo ? ` · ${f.titulo.slice(0, 40)}` : ""}`;

/**
 * Unir con otra captura: un anuncio reenviado desde un chat llega solo como archivo y el mismo compartido después llega con enlace, pero
 * Meta no les da el mismo identificador y el sistema no los reconoce como uno. Aquí se elige con cuál unirla: primero las que el sistema
 * sugiere (llegaron con pocos minutos de diferencia y una aporta lo que le falta a la otra) y luego todas las demás. La más antigua queda
 * y absorbe a la otra (enlace, copy, cifras, archivo y quién lo compartió).
 */
export function UnirCaptura({ fila, otras, alUnir }: { fila: FilaInstagram; otras: FilaInstagram[]; alUnir: () => void }) {
  const { mostrarToast } = useToast();
  const [elegida, setElegida] = useState("");
  const [uniendo, setUniendo] = useState(false);

  const { sugeridas, resto } = useMemo(() => {
    const candidatas = otras.filter((o) => o.id !== fila.id && !sonDeContenidosDistintos(fila, o));
    const sugerencias = sugerirUniones(paraUnir(fila), candidatas.map(paraUnir));
    const ids = new Set(sugerencias.map((s) => s.id));
    return {
      sugeridas: sugerencias.map((s) => ({ s, f: candidatas.find((c) => c.id === s.id) as FilaInstagram })),
      resto: candidatas.filter((c) => !ids.has(c.id)).sort((a, b) => b.numero - a.numero),
    };
  }, [fila, otras]);

  async function unir() {
    const otra = otras.find((o) => o.id === elegida);
    if (!otra || uniendo) return;
    const [vieja, nueva] = fila.numero < otra.numero ? [fila, otra] : [otra, fila];
    if (!confirm(`Se unirán ${numeroInstagram(vieja.numero)} y ${numeroInstagram(nueva.numero)} en ${numeroInstagram(vieja.numero)}, la más antigua. ${numeroInstagram(nueva.numero)} se elimina y lo que aporte (enlace, copy, cifras, archivo) pasa a la que queda. ¿Continuar?`)) return;
    setUniendo(true);
    const r = await unirCapturas(fila.id, otra.id).catch(() => ({ error: "No se pudieron unir las capturas." }) as { error?: string; numero?: number; absorbida?: number });
    setUniendo(false);
    if (r.error || r.numero === undefined) return mostrarToast(r.error ?? "No se pudieron unir las capturas.", "destructive");
    mostrarToast(`Unidas en ${numeroInstagram(r.numero)}`);
    alUnir();
  }

  return (
    <Seccion icono={EnlaceIcon} titulo="Unir con otra captura">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Captura del mismo anuncio</span>
        <select value={elegida} onChange={(e) => setElegida(e.target.value)} className={fieldClass}>
          <option value="">Elige una captura</option>
          {sugeridas.length > 0 && (
            <optgroup label="Sugeridas">
              {sugeridas.map(({ s, f }) => (
                <option key={f.id} value={f.id}>
                  {`${descripcion(f)} · ${textoMinutos(s.minutos)}`}
                </option>
              ))}
            </optgroup>
          )}
          {resto.length > 0 && (
            <optgroup label={sugeridas.length > 0 ? "Las demás" : "Todas"}>
              {resto.map((f) => (
                <option key={f.id} value={f.id}>
                  {descripcion(f)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <Button type="button" variant="secondary" onClick={() => void unir()} disabled={!elegida || uniendo} className="self-start">
        {uniendo ? "Uniendo…" : "Unir"}
      </Button>
    </Seccion>
  );
}
