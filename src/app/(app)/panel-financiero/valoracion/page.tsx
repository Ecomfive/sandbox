import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { CLASE_FILA_AF4, claseCeldaAF4, claseNumeroAF4, claseSigno } from "@/components/af4/estilos-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { fechaCorta, hoyPanama, rangoMeses as textoRango } from "@/lib/af4/fecha";
import { dinero, dineroKpi, porcentaje, veces } from "@/lib/af4/formato";
import type { FilaAF4 } from "@/lib/af4/tabla-financiera";
import { requireModulo } from "@/lib/auth";
import { cargarEerr } from "@/lib/finanzas/cargar-eerr";
import { cargarPresupuestoVigente } from "@/lib/finanzas/cargar-presupuesto";
import { cargarCapital } from "@/lib/finanzas/cargar-rentabilidad";
import { ultimosMeses } from "@/lib/finanzas/eerr";
import { mesesDelAnio, serieDeLineas } from "@/lib/finanzas/presupuesto";
import {
  PASOS_CRECIMIENTO,
  anualizarBase,
  calcularDcf,
  cargarValoracion,
  crecimientoInicial,
  multiploImplicito,
  rangoValor,
  sensibilidadDcf,
  type AltaBien,
  type FuenteCrecimiento,
} from "@/lib/finanzas/valoracion";
import { createServiceClient } from "@/lib/supabase/server";
import { SupuestosValoracion } from "./supuestos-valoracion";
import { DesplazableX } from "@/components/ui/desplazable-x";

export const metadata = { title: "Valoración" };

export const dynamic = "force-dynamic";

const MESES_BASE = 12;

const FUENTE: Record<FuenteCrecimiento, string> = {
  presupuesto: "Del presupuesto",
  tendencia: "Tendencia de los ingresos",
  sin_datos: "Sin datos",
};

function SinValoracion({ mensaje, accion }: { mensaje: string; accion?: { href: string; etiqueta: string } }) {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Valoración" oculto />
      <EstadoVacioAF4 titulo={mensaje} accion={accion} />
    </Pagina>
  );
}

export default async function ValoracionPage() {
  const usuario = await requireModulo("panel-financiero");
  if (!usuario.modulos.includes("estado-resultados")) {
    return <SinValoracion mensaje="La valoración se arma con el Estado de resultados: pide acceso a ese módulo." />;
  }
  const puedeEscribir = !usuario.modulosSoloLectura.includes("estado-resultados");
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const ventana = ultimosMeses(hoy, MESES_BASE + 1);
  const anio = Number(hoy.slice(0, 4));

  const [eerrR, valoracion, capital, bienes, ppto, actualizado] = await Promise.all([
    cargarEerr(supabase, null, ventana),
    cargarValoracion(supabase),
    cargarCapital(supabase, ventana),
    supabase.from("fin_bienes_uso").select("fecha_alta, importe").gte("fecha_alta", ventana[0]),
    usuario.modulos.includes("presupuesto") ? cargarPresupuestoVigente(supabase, anio) : Promise.resolve(null),
    ultimaActualizacionLibro(supabase),
  ]);
  if ("error" in eerrR) {
    return <SinValoracion mensaje="Todavía no hay un libro de movimientos para valorar la empresa" accion={{ href: "/libro-movimientos/importar", etiqueta: "Importar el libro" }} />;
  }
  const { eerr, conDatos } = eerrR;
  const meses = eerr.meses.filter((m) => m < mesEnCurso && conDatos.has(m)).slice(-MESES_BASE);
  if (!meses.length) {
    return <SinValoracion mensaje="Hace falta al menos un mes cerrado con movimientos para valorar la empresa" />;
  }

  const s = valoracion.supuestos;
  const altas: AltaBien[] = bienes.error ? [] : ((bienes.data ?? []) as { fecha_alta: string; importe: number | string }[]).map((b) => ({ fecha_alta: String(b.fecha_alta), importe: Number(b.importe) }));
  const anual = anualizarBase(meses, eerr.ingresosNetos, eerr.ebitda, altas);
  const sal = capital.saldos;
  const capitalTrabajo = sal.cxcCartera + sal.cobrosPorDepositar + sal.efectivoRepartidores + (sal.inventario ?? 0) - sal.cxpCartera - sal.comprasAbiertas;
  const mesesPpto = mesesDelAnio(anio);
  const ingresosPpto = ppto ? mesesPpto.map((m) => serieDeLineas(ppto.lineas, "base", mesesPpto).ingresos[m] ?? 0) : null;
  const crecimiento = crecimientoInicial(ingresosPpto, meses.map((m) => eerr.ingresosNetos[m] ?? 0));
  const base = { ...anual, capitalTrabajo, crecimientoInicial: crecimiento.crecimiento };
  const dcf = calcularDcf(base, s);
  const matriz = sensibilidadDcf(base, s);
  const rango = rangoValor(anual.ebitda, s, dcf, matriz);
  const implicito = multiploImplicito(dcf.valor, anual.ebitda);
  const periodo = textoRango(meses);
  const columnas = PASOS_CRECIMIENTO.map((_, j) => matriz[0][j].crecimiento);

  // El flujo libre proyectado como estado por año (la columna de la derecha es el valor terminal).
  const filasDcf: FilaAF4[] = dcf.valido
    ? [
        { clave: "crecimiento", etiqueta: "Crecimiento", tipo: "porcentaje", valores: dcf.anios.map((a) => a.crecimiento), total: null },
        { clave: "ingresos", etiqueta: "Ingresos", tipo: "seccion", valores: dcf.anios.map((a) => a.ingresos), total: null },
        { clave: "ebitda", etiqueta: "EBITDA", tipo: "subtotal", valores: dcf.anios.map((a) => a.ebitda), total: null },
        { clave: "impuestos", etiqueta: "− Impuestos", tipo: "detalle", valores: dcf.anios.map((a) => a.impuestos), total: null },
        { clave: "capex", etiqueta: "− Capex", tipo: "detalle", valores: dcf.anios.map((a) => a.capex), total: null },
        { clave: "capital", etiqueta: "− Aumento del capital de trabajo", tipo: "detalle", valores: dcf.anios.map((a) => a.variacionCapital), total: null },
        { clave: "flujo", etiqueta: "Flujo libre", tipo: "subtotal", valores: dcf.anios.map((a) => a.flujoLibre), total: dcf.valorTerminal },
        { clave: "presente", etiqueta: "Valor presente", tipo: "total", valores: dcf.anios.map((a) => a.valorPresente), total: dcf.valorPresenteTerminal },
      ]
    : [];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Valoración" datosHasta={meses[meses.length - 1]} actualizado={actualizado} />

      <KpiGroup titulo={`Valor de la empresa · base ${periodo} anualizado · USD`}>
        <FilaKpiAF4>
          <KpiAF4 titulo={`Por múltiplo (${s.multiplo}× EBITDA)`} destacado valor={dineroKpi(rango.porMultiplo)} subtexto={`EBITDA anual ${dinero(anual.ebitda)}`} />
          <KpiAF4
            titulo={`DCF (${porcentaje(s.tasaDescuento)} · ${porcentaje(s.crecimientoPerpetuo)} perpetuo)`}
            tono={dcf.valido ? "neutral" : "warning"}
            valor={dcf.valido ? dineroKpi(dcf.valor) : "—"}
            subtexto={dcf.valido ? (implicito === null ? undefined : `Equivale a ${veces(implicito)} EBITDA`) : (dcf.motivo ?? undefined)}
          />
          <KpiAF4 titulo="Rango entre múltiplo y DCF" valor={`${dineroKpi(rango.minimo)} – ${dineroKpi(rango.maximo)}`} />
          {rango.sensibilidad && <KpiAF4 titulo="Rango de la sensibilidad" valor={`${dineroKpi(rango.sensibilidad.minimo)} – ${dineroKpi(rango.sensibilidad.maximo)}`} />}
          {dcf.pesoTerminal !== null && <KpiAF4 titulo="Peso del valor terminal" valor={porcentaje(dcf.pesoTerminal)} />}
        </FilaKpiAF4>
      </KpiGroup>

      <MarcoAF4 id="titulo-supuestos" titulo="Supuestos" detalle={valoracion.actualizadoEn ? `Guardados el ${fechaCorta(valoracion.actualizadoEn.slice(0, 10))}` : undefined}>
        <div className="px-1 py-1">
          <SupuestosValoracion key={JSON.stringify(s)} supuestos={s} puedeEscribir={puedeEscribir} />
        </div>
      </MarcoAF4>

      <KpiGroup titulo="Año base · USD">
        <FilaKpiAF4>
          <KpiAF4 titulo="Ingresos anuales" valor={dineroKpi(anual.ingresos)} />
          <KpiAF4 titulo="Margen EBITDA" valor={porcentaje(dcf.valido ? dcf.margenEbitda : null)} />
          <KpiAF4 titulo="Capex (altas de bienes de uso)" valor={dineroKpi(anual.capex)} subtexto={dcf.valido ? `${porcentaje(dcf.capexSobreIngresos)} de los ingresos` : undefined} />
          <KpiAF4
            titulo="Capital de trabajo"
            valor={dineroKpi(capitalTrabajo)}
            subtexto={dcf.valido ? `${porcentaje(dcf.capitalSobreIngresos)} de los ingresos${capital.parcial ? " · solo carteras" : ""}` : undefined}
            tono={capital.parcial ? "warning" : "neutral"}
          />
          <KpiAF4 titulo="Crecimiento año 1" valor={porcentaje(Math.min(50, Math.max(-30, crecimiento.crecimiento)))} subtexto={FUENTE[crecimiento.fuente]} />
        </FilaKpiAF4>
      </KpiGroup>

      {dcf.valido && (
        <TablaFinanciera
          id="titulo-dcf"
          titulo="Flujo libre proyectado"
          detalle="USD"
          ariaLabel="Flujo libre proyectado por año y valor terminal"
          columnas={dcf.anios.map((a) => ({ clave: String(a.anio), etiqueta: `Año ${a.anio}` }))}
          filas={filasDcf}
          etiquetaTotal="Terminal"
        />
      )}

      <MarcoAF4 id="titulo-sensibilidad" titulo="Sensibilidad del DCF" detalle="Tasa de descuento × crecimiento a perpetuidad · USD" sinRelleno>
        <DesplazableX ariaLabel="Sensibilidad del valor DCF" className="rounded-b-xl">
          <table className="tabla-datos w-full text-[13px]">
            <caption className="sr-only">Valor DCF según la tasa de descuento (filas) y el crecimiento a perpetuidad (columnas)</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                <th scope="col" className={`${claseEncabezadoColumna} text-left whitespace-nowrap`}>
                  Tasa \ Crecimiento
                </th>
                {columnas.map((g) => (
                  <th key={g} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                    {porcentaje(g)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matriz.map((fila) => (
                <tr key={fila[0].tasa} className={CLASE_FILA_AF4.seccion}>
                  <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                    {porcentaje(fila[0].tasa)}
                  </th>
                  {fila.map((c) => {
                    const actual = c.tasa === s.tasaDescuento && c.crecimiento === s.crecimientoPerpetuo;
                    return (
                      <td key={c.crecimiento} className={`${claseNumeroAF4} font-normal ${actual ? "bg-accent font-semibold text-accent-foreground" : ""} ${claseSigno(c.valor)}`}>
                        {c.valor === null ? "—" : dinero(c.valor)}
                        {actual && <span className="sr-only"> (supuestos actuales)</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DesplazableX>
      </MarcoAF4>
    </Pagina>
  );
}
