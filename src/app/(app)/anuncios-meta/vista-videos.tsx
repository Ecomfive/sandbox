"use client";

import { useState } from "react";
import type { EstadoAnalisisAutomatico } from "@/lib/meta-ads/ajustes";
import type { HistorialSecciones } from "@/lib/meta-ads/analisis-tipos";
import { enLaVista, hallazgosEnVista, productoEnMarcha, type EnMarcha, type VistaActividad } from "@/lib/meta-ads/en-marcha";
import type { SenalesCreativas } from "@/lib/meta-ads/senales-creativas";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import { HallazgosDeSeccion } from "./hallazgos-tarjetas";
import { QueGeneraMasVentas } from "./historial-seccion";
import { ListaVideos } from "./lista-videos";
import { ResumenVideos } from "./resumen-videos";
import { SelectorActividad } from "./selector-actividad";
import { SenalesCreativasVista } from "./senales-vista";

const estadoDe = (v: VideoVista) => (v.enMarcha ? "activo" : "apagado");

/**
 * Anuncios Meta › Videos (25 nov 2026, pedido de Alcides): arranca en los videos que hoy están en anuncios activos de campañas en marcha, con lo que pide atención primero. «Apagados» y «Todos» dejan consultar el resto; lo elegido manda
 * sobre el resumen, las señales, los hallazgos y la lista. Los rankings de ángulos, ganchos y formatos son de todo el historial: son aprendizaje.
 */
export function VistaVideos({ videos, senales, historial, enMarcha, escribe, iaConectada, sinAnalizar, abrirInicial, automatico }: { videos: VideoVista[]; senales: SenalesCreativas[]; historial: HistorialSecciones | null; enMarcha: EnMarcha; escribe: boolean; iaConectada: boolean; sinAnalizar: number; abrirInicial: string | null; automatico: EstadoAnalisisAutomatico }) {
  const [vista, setVista] = useState<VistaActividad>(() => (abrirInicial && videos.some((v) => v.id === abrirInicial && !v.enMarcha) ? "todos" : "activos"));
  const visibles = videos.filter((v) => enLaVista(estadoDe(v), vista));
  const activos = videos.filter((v) => v.enMarcha).length;
  const cuantos = { activos, apagados: videos.length - activos, todos: videos.length };
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SelectorActividad etiqueta="Qué videos ver" vista={vista} alCambiar={setVista} cuentas={cuantos} textos={{ activos: "En marcha", apagados: "Apagados", todos: "Todos" }} />
        <p className="m-0 min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
          {vista === "activos" ? "En anuncios activos de campañas que gastaron en los últimos 7 días. Primero los que piden atención." : "Salen los que gastaron en el periodo elegido arriba."}
        </p>
      </div>
      <ResumenVideos videos={visibles} escribe={escribe} iaConectada={iaConectada} />
      {historial && (
        <div className="flex flex-col gap-3">
          <SenalesCreativasVista key={`s-${vista}`} senales={senales.filter((s) => enLaVista(productoEnMarcha(enMarcha, s.producto) ? "activo" : "apagado", vista))} />
          <HallazgosDeSeccion key={`h-${vista}`} titulo="Lo que dicen los datos de los videos" hallazgos={hallazgosEnVista(historial.hallazgos.videos, enMarcha, vista)} />
          <QueGeneraMasVentas historial={historial} claves={["videos", "angulos", "ganchos", "formatos"]} />
        </div>
      )}
      <p className="-mb-2 text-xs text-muted-foreground">Del periodo elegido arriba. Un video repetido en varios anuncios cuenta una sola vez. Ordénalos, fíltralos o agrúpalos por campaña, ángulo, gancho o producto.</p>
      <ListaVideos videos={visibles} escribe={escribe} iaConectada={iaConectada} sinAnalizar={sinAnalizar} abrirInicial={abrirInicial} automatico={automatico} />
    </>
  );
}
