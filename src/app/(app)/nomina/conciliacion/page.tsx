import Link from "next/link";
import type { ReactNode } from "react";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { requireModulo } from "@/lib/auth";
import { fechaCorta, mesCorto, mesMedio } from "@/lib/af4/fecha";
import { dinero2, dineroKpi, entero } from "@/lib/af4/formato";
import { cargarConciliacion, cargarUnidades } from "@/lib/nomina/cargar";
import { cargarAlLibro } from "@/lib/nomina/cargar-al-libro";
import { conciliarPorMes, conciliarPorTienda, explicarDiferencias, sinExplicar } from "@/lib/nomina/conciliacion";
import { createServiceClient } from "@/lib/supabase/server";
import { NominaAlLibro } from "./nomina-al-libro";
import { DesplazableX } from "@/components/ui/desplazable-x";

export const metadata = { title: "Conciliación con el libro" };

export const dynamic = "force-dynamic";

/** Una diferencia de más de un dólar se marca con un punto ámbar. */
const TOLERANCIA = 1;

function Diferencia({ valor }: { valor: number }) {
  const marca = Math.abs(valor) > TOLERANCIA;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {marca && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
      {dinero2(valor)}
      {marca && <span className="sr-only"> (no cuadra)</span>}
    </span>
  );
}

const th = `${claseEncabezadoColumna} whitespace-nowrap`;
const thNum = `${th} text-right`;
const td = `${claseCeldaColumna} whitespace-nowrap`;
const tdNum = `${td} text-right tabular-nums`;

function Tabla({ id, titulo, detalle, children }: { id: string; titulo: string; detalle?: string; children: ReactNode }) {
  const nombre = detalle ? `${titulo}, ${detalle}` : titulo;
  return (
    <MarcoAF4 id={id} titulo={titulo} detalle={detalle} sinRelleno>

      <DesplazableX ariaLabel={nombre} className="rounded-b-xl">
        <table className="tabla-datos w-full text-sm">
          <caption className="sr-only">{nombre}</caption>
          {children}
        </table>
      </DesplazableX>
    </MarcoAF4>
  );
}

export default async function ConciliacionNominaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("nomina");
  const { mes } = await searchParams;
  const supabase = createServiceClient();
  const datos = await cargarConciliacion(supabase);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Conciliación con el libro" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer la conciliación">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  // Solo los meses que tienen nómina: los otros no hay con qué compararlos.
  const conNomina = new Set(datos.costos.map((c) => c.periodo));
  const filas = conciliarPorMes(datos.costos, datos.libro, datos.comision).filter((f) => conNomina.has(f.periodo));
  if (!filas.length) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Conciliación con el libro" imprimir={false} />
        <EstadoVacioAF4 titulo="Todavía no hay nómina cargada para conciliar" accion={{ href: "/nomina/importar", etiqueta: "Importar los Excel" }} />
      </Pagina>
    );
  }
  const elegido = filas.find((f) => f.periodo === mes) ?? [...filas].reverse().find((f) => Math.abs(f.diferencia) > TOLERANCIA) ?? filas[filas.length - 1];
  const porTienda = conciliarPorTienda(elegido.periodo, datos.costos, datos.eerr, datos.libro, datos.base, datos.reparto);
  const explicaciones = explicarDiferencias(elegido, datos.libro, datos.retenciones[elegido.periodo] ?? 0);
  const resto = sinExplicar(elegido, explicaciones);
  const movimientos = datos.libro.filter((m) => m.periodo === elegido.periodo).sort((a, b) => b.monto - a.monto);
  const cuadran = filas.filter((f) => Math.abs(f.diferencia) <= TOLERANCIA).length;
  const nominaTotal = filas.reduce((a, f) => a + f.formal + f.externa, 0);
  const libroTotal = filas.reduce((a, f) => a + f.sueldosLibro + f.otrosLibro, 0);
  const diferenciaTotal = filas.reduce((a, f) => a + f.diferencia, 0);

  // Nómina al libro (interruptor de Estado de resultados › Ajustes, migración 0917): sin la migración no se muestra.
  const [alLibro, unidades] = await Promise.all([cargarAlLibro(supabase, elegido.periodo), cargarUnidades(supabase)]);
  const escribe = (m: string) => usuario.modulos.includes(m) && !usuario.modulosSoloLectura.includes(m);
  const verAlLibro = !("error" in alLibro) && (alLibro.activo || alLibro.plan.yaPasado);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Conciliación con el libro"
        filtros={
          <SelectorEnlace
            etiqueta="Elegir mes"
            opciones={[...filas].reverse().map((f) => ({ valor: f.periodo, etiqueta: mesMedio(f.periodo), href: `/nomina/conciliacion?mes=${f.periodo}` }))}
            elegido={elegido.periodo}
          />
        }
        datosHasta={filas.at(-1)?.periodo ?? null}
      />

      <FilaKpiAF4>
        <KpiAF4
          titulo="Meses que cuadran"
          destacado
          tono={cuadran === filas.length ? "success" : "warning"}
          valor={`${entero(cuadran)} de ${entero(filas.length)}`}
          subtexto="Planilla (neto) = SUELDOS · externa (USDT) = OTROS SUELDOS"
        />
        <KpiAF4 titulo="Nómina en esos meses" valor={dineroKpi(nominaTotal)} />
        <KpiAF4 titulo="Sueldos en el libro (EERR)" valor={dineroKpi(libroTotal)} />
        <KpiAF4
          titulo="Diferencia (libro − nómina)"
          tono={Math.abs(diferenciaTotal) > TOLERANCIA ? "warning" : "success"}
          valor={dineroKpi(diferenciaTotal)}
          subtexto={`Tolerancia ${dinero2(TOLERANCIA)} por mes`}
        />
      </FilaKpiAF4>

      <Tabla id="titulo-por-mes" titulo="Conciliación por mes">
        <thead>
          <tr className={claseFilaEncabezado}>
            <th scope="col" className={th}>Mes</th>
            <th scope="col" className={thNum}>Planilla (neto)</th>
            <th scope="col" className={thNum}>SUELDOS libro</th>
            <th scope="col" className={thNum}>Diferencia</th>
            <th scope="col" className={thNum}>Externa (USDT)</th>
            <th scope="col" className={thNum}>OTROS SUELDOS libro</th>
            <th scope="col" className={thNum}>Diferencia</th>
            <th scope="col" className={thNum}>Total diferencia</th>
            <th scope="col" className={thNum}>Fuera del EERR</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const activo = f.periodo === elegido.periodo;
            return (
              <tr key={f.periodo} className={`border-t border-border/60 ${activo ? "bg-accent" : ""}`}>
                <th scope="row" className={`${td} text-left font-normal`}>
                  <Link href={`/nomina/conciliacion?mes=${f.periodo}`} aria-current={activo ? "true" : undefined} className={`font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
                    {mesCorto(f.periodo)}
                  </Link>
                </th>
                <td className={tdNum}>{dinero2(f.formal)}</td>
                <td className={tdNum}>{dinero2(f.sueldosLibro)}</td>
                <td className={tdNum}><Diferencia valor={f.difFormal} /></td>
                <td className={tdNum}>{dinero2(f.externa)}</td>
                <td className={tdNum}>{dinero2(f.otrosLibro)}</td>
                <td className={tdNum}><Diferencia valor={f.difExterna} /></td>
                <td className={`${tdNum} font-medium`}><Diferencia valor={f.diferencia} /></td>
                <td className={`${tdNum} text-muted-foreground`}>{f.fueraEerr ? dinero2(f.fueraEerr) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>

      <section aria-labelledby="titulo-mes" className="flex flex-col gap-4">
        <h2 id="titulo-mes" className="text-base font-semibold">
          {mesCorto(elegido.periodo)}: diferencia {dinero2(elegido.diferencia)}
        </h2>

        {explicaciones.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <ul className="flex flex-col gap-1.5">
              {explicaciones.map((e) => (
                <li key={e.texto} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5">
                  <span>{e.texto}</span>
                  <span className="tabular-nums">{dinero2(e.monto)}</span>
                </li>
              ))}
            </ul>
            {Math.abs(elegido.diferencia) > TOLERANCIA && (
              <p className="mt-3 flex items-center justify-between gap-6 border-t border-border pt-2 text-muted-foreground">
                <span>Sin explicar</span>
                <span className="tabular-nums">{dinero2(resto)}</span>
              </p>
            )}
          </div>
        )}

        {verAlLibro && !("error" in alLibro) && (
          <NominaAlLibro
            key={elegido.periodo}
            periodo={elegido.periodo}
            mes={mesCorto(elegido.periodo)}
            filas={alLibro.plan.cuadro.map((f) => ({ ...f, unidad: ("error" in unidades ? null : unidades.nombre.get(f.unidadId)) ?? "—" }))}
            reemplazar={alLibro.plan.reemplazar}
            yaPasado={alLibro.plan.yaPasado}
            activo={alLibro.activo}
            cerrado={alLibro.cerrado}
            puedeEscribir={escribe("nomina") && escribe("libro-movimientos")}
          />
        )}

        <Tabla id="titulo-por-tienda" titulo="Por tienda" detalle={mesCorto(elegido.periodo)}>
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={th}>Tienda</th>
              <th scope="col" className={thNum}>Planilla (repartida)</th>
              <th scope="col" className={thNum}>SUELDOS EERR</th>
              <th scope="col" className={thNum}>Externa</th>
              <th scope="col" className={thNum}>OTROS SUELDOS EERR</th>
              <th scope="col" className={thNum}>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {porTienda.map((t) => (
              <tr key={t.unidad} className="border-t border-border/60">
                <th scope="row" className={`${td} text-left font-normal`}>{t.unidad}</th>
                <td className={tdNum}>{dinero2(t.nominaFormal)}</td>
                <td className={tdNum}>{dinero2(t.libroSueldos)}</td>
                <td className={tdNum}>{dinero2(t.nominaExterna)}</td>
                <td className={tdNum}>{dinero2(t.libroOtros)}</td>
                <td className={`${tdNum} font-medium`}><Diferencia valor={t.diferencia} /></td>
              </tr>
            ))}
          </tbody>
        </Tabla>

        <Tabla id="titulo-sueldos-libro" titulo="Sueldos del libro" detalle={mesCorto(elegido.periodo)}>
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={th}>Pago</th>
              <th scope="col" className={th}>Tienda</th>
              <th scope="col" className={th}>Tipo</th>
              <th scope="col" className={th}>Descripción</th>
              <th scope="col" className={th}>EERR</th>
              <th scope="col" className={thNum}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={6} className={`${td} text-muted-foreground`}>El libro no tiene sueldos en este mes.</td>
              </tr>
            )}
            {movimientos.map((m, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className={`${td} text-muted-foreground`}>{m.fecha ? fechaCorta(m.fecha) : "—"}</td>
                <td className={td}>{m.unidad}</td>
                <td className={`${td} text-muted-foreground`}>{m.tipo}</td>
                <td className={`${claseCeldaColumna} max-w-xl truncate`}>{m.descripcion}</td>
                <td className={`${td} text-muted-foreground`}>{m.en_eerr ? "Sí" : "No"}</td>
                <td className={tdNum}>{dinero2(m.monto)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </section>
    </Pagina>
  );
}
