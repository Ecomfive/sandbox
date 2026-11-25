"use client";

import { useState } from "react";
import type { HistorialSecciones } from "@/lib/meta-ads/analisis-tipos";
import type { CuentaVista } from "@/lib/meta-ads/datos";
import { enLaVista, hallazgosEnVista, type EnMarcha, type VistaActividad } from "@/lib/meta-ads/en-marcha";
import type { AnuncioVista, CampanaVista } from "@/lib/meta-ads/vistas";
import { CampanasLista } from "./campanas-lista";
import { HallazgosDeSeccion } from "./hallazgos-tarjetas";
import { QueGeneraMasVentas } from "./historial-seccion";
import { ResumenCampanas } from "./resumen-campanas";
import { SelectorActividad } from "./selector-actividad";

const estadoDe = (c: CampanaVista) => (c.enMarcha ? "activo" : "apagado");

/**
 * Anuncios Meta › Campañas (25 nov 2026, pedido de Alcides): arranca en las que están en marcha, con lo que pide atención primero. «Apagadas o sin gasto» deja consultar las demás y «Todas» las junta; lo elegido manda sobre el resumen,
 * los hallazgos, lo que más vende y la lista.
 */
export function VistaCampanas({ campanas, anuncios, cuentas, productos, historial, enMarcha, escribe, abrirInicial, soloFaltanInicial }: { campanas: CampanaVista[]; anuncios: AnuncioVista[]; cuentas: CuentaVista[]; productos: string[]; historial: HistorialSecciones | null; enMarcha: EnMarcha; escribe: boolean; abrirInicial: string | null; soloFaltanInicial: boolean }) {
  // Si el enlace abre una campaña que no está en marcha (o pide las que faltan por etiquetar), se arranca viendo todas para que estén en la lista.
  const [vista, setVista] = useState<VistaActividad>(() => (soloFaltanInicial || campanas.some((c) => c.id === abrirInicial && !c.enMarcha) ? "todos" : "activos"));
  const visibles = campanas.filter((c) => enLaVista(estadoDe(c), vista));
  const activas = campanas.filter((c) => c.enMarcha).length;
  const cuantas = { activos: activas, apagados: campanas.length - activas, todos: campanas.length };
  const campanasVendedoras = historial?.rankings.campanas.filter((f) => enLaVista(enMarcha.campanas.includes(f.nombre) ? "activo" : "apagado", vista)) ?? [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SelectorActividad etiqueta="Qué campañas ver" vista={vista} alCambiar={setVista} cuentas={cuantas} textos={{ activos: "En marcha", apagados: "Apagadas o sin gasto", todos: "Todas" }} />
        <p className="m-0 min-w-0 flex-1 basis-64 text-xs text-muted-foreground">
          {vista === "activos" ? "Encendidas en Meta que gastaron en los últimos 7 días. Primero las que piden atención." : "Salen las del periodo elegido arriba: para ver las de hace tiempo, elige 6 meses o 1 año."}
        </p>
      </div>
      <ResumenCampanas campanas={visibles} />
      {historial && (
        <div className="flex flex-col gap-3">
          <HallazgosDeSeccion key={`h-${vista}`} titulo="Lo que dicen los datos de las campañas" hallazgos={hallazgosEnVista(historial.hallazgos.campanas, enMarcha, vista)} />
          <QueGeneraMasVentas key={`v-${vista}`} historial={{ ...historial, rankings: { ...historial.rankings, campanas: campanasVendedoras } }} claves={["campanas"]} />
        </div>
      )}
      <CampanasLista campanas={visibles} anuncios={anuncios} cuentas={cuentas} productos={productos} escribe={escribe} abrirInicial={abrirInicial} soloFaltanInicial={soloFaltanInicial} />
    </>
  );
}
