import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Tooltip } from "@/components/ui/tooltip";
import { requireModulo } from "@/lib/auth";
import { formatearFecha, formatearFechaHoraCompleta, formatearMoneda } from "@/lib/formato";
import { ActualizarIcon, WalletIcon } from "@/lib/nav-icons";
import { TablaRetiros, type FilaRetiro } from "./tabla-retiros";
import { TarjetasResumenRetiros } from "./tarjetas-resumen";

export const metadata = { title: "Conciliación de Retiros" };

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

const COLUMNAS_RETIROS =
  "id, numero_correlativo, monto, comision, monto_neto, monto_recibido, fecha, fecha_cierre, fecha_limite, estado, consolidado, a_recibir, asignado_a, notas, soporte_numero, banco, estado_dropi, plataforma_id, cuenta_retiro_id, gestionado_por, plataformas(nombre), cuentas_retiro(nombre)";

/** `fecha_rechazo`, `fecha_aprobado`, `fecha_cancelado_dropi`, `fecha_novedad` (migraciones 0044-0046)
 * y `fecha_recibido` (migración 0047) son fechas que no siempre existen; sin esas migraciones, se sigue
 * sirviendo la página consultando sin esas columnas. */
function consultarRetiros(supabase: ReturnType<typeof createServiceClient>, paisId: string) {
  return supabase
    .from("retiros")
    .select(
      `${COLUMNAS_RETIROS}, fecha_rechazo, fecha_aprobado, fecha_cancelado_dropi, fecha_novedad, fecha_recibido`
    )
    .eq("pais_id", paisId)
    .order("fecha", { ascending: false })
    .limit(1000)
    .then((resultado) =>
      resultado.error
        ? supabase
            .from("retiros")
            .select(COLUMNAS_RETIROS)
            .eq("pais_id", paisId)
            .order("fecha", { ascending: false })
            .limit(1000)
        : resultado
    );
}

export default async function RetirosPage() {
  const usuario = await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [
    { data: plataformasPais },
    { data: saldos },
    { data: retiros },
    { data: cuentasRetiro },
    { data: perfiles },
  ] =
    await Promise.all([
      supabase
        .from("pais_plataformas")
        .select("plataforma_id, disponible_para_retiro, plataformas(id, nombre)")
        .eq("pais_id", pais.id),
      supabase
        .from("saldos_wallet")
        .select("plataforma_id, monto, fecha, actualizado_en, plataformas(nombre)")
        .eq("pais_id", pais.id)
        .order("fecha", { ascending: false }),
      consultarRetiros(supabase, pais.id),
      supabase
        .from("cuentas_retiro")
        .select("id, nombre, comision_tipo, comision_porcentaje, comision_monto_fijo")
        .eq("pais_id", pais.id)
        .eq("activa", true)
        .order("nombre"),
      supabase.from("perfiles").select("id, nombre, email").eq("activo", true).order("nombre"),
    ]);

  const plataformas = (plataformasPais ?? [])
    .map((pp) => pp.plataformas as unknown as { id: string; nombre: string } | null)
    .filter((p): p is { id: string; nombre: string } => p !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const plataformasParaCrear = (plataformasPais ?? [])
    .filter((pp) => pp.disponible_para_retiro)
    .map((pp) => pp.plataformas as unknown as { id: string; nombre: string } | null)
    .filter((p): p is { id: string; nombre: string } => p !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const ultimoSaldoPorPlataforma = new Map<string, { monto: number; fecha: string; nombre: string }>();
  for (const s of saldos ?? []) {
    if (!ultimoSaldoPorPlataforma.has(s.plataforma_id)) {
      ultimoSaldoPorPlataforma.set(s.plataforma_id, {
        monto: Number(s.monto),
        fecha: s.fecha,
        nombre: (s.plataformas as unknown as { nombre: string } | null)?.nombre ?? "?",
      });
    }
  }

  const ultimaActualizacion = (saldos ?? []).reduce<string | null>(
    (max, s) => (max === null || Date.parse(s.actualizado_en) > Date.parse(max) ? s.actualizado_en : max),
    null
  );

  const mesActual = hoy().slice(0, 7);
  const ultimoDiaDelMes = `${mesActual}-${String(new Date(Number(mesActual.slice(0, 4)), Number(mesActual.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;
  const abiertos = (retiros ?? []).filter((r) => r.estado === "abierto").length;
  const conNovedad = (retiros ?? []).filter((r) => r.estado === "novedad").length;
  const cerradosDelMes = (retiros ?? []).filter((r) => r.estado === "cerrado" && r.fecha.slice(0, 7) === mesActual);
  const totalCerradoMes = cerradosDelMes.reduce((acc, r) => acc + Number(r.monto), 0);
  const cerrados = (retiros ?? []).filter((r) => r.estado === "cerrado").length;
  const totalRetiros = (retiros ?? []).length;

  const nombrePerfil = new Map((perfiles ?? []).map((p) => [p.id, p.nombre ?? p.email]));
  const filasRetiro: FilaRetiro[] = (retiros ?? []).map((r) => ({
    id: r.id,
    numeroCorrelativo: r.numero_correlativo,
    consolidado: r.consolidado,
    fecha: r.fecha,
    plataformaId: r.plataforma_id,
    plataformaNombre: (r.plataformas as unknown as { nombre: string } | null)?.nombre ?? null,
    cuentaRetiroId: r.cuenta_retiro_id,
    destino: (r.cuentas_retiro as unknown as { nombre: string } | null)?.nombre ?? r.banco ?? "—",
    monto: Number(r.monto),
    estado: r.estado,
    comision: Number(r.comision),
    aRecibir: Number(r.a_recibir ?? r.monto_neto),
    montoRecibido: r.monto_recibido === null ? null : Number(r.monto_recibido),
    fechaRecibido: (r as { fecha_recibido?: string | null }).fecha_recibido ?? null,
    fechaCierre: r.fecha_cierre,
    fechaLimite: r.fecha_limite,
    asignadoNombre: r.asignado_a ? (nombrePerfil.get(r.asignado_a) ?? "Usuario inactivo") : null,
    estadoDropi: r.estado_dropi,
    // Pueden no venir en el tipo inferido si la consulta cayó al plan B sin esas columnas.
    fechaAprobado: (r as { fecha_aprobado?: string | null }).fecha_aprobado ?? null,
    fechaRechazo: (r as { fecha_rechazo?: string | null }).fecha_rechazo ?? null,
    fechaCanceladoDropi: (r as { fecha_cancelado_dropi?: string | null }).fecha_cancelado_dropi ?? null,
    fechaNovedad: (r as { fecha_novedad?: string | null }).fecha_novedad ?? null,
    gestionadoPor: r.gestionado_por,
    notas: r.notas,
    soporteNumero: r.soporte_numero,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Conciliación de Retiros" oculto />

      {/* Una sola barra «Dashboard»: el saldo de wallet y el resumen de retiros son tarjetas hermanas de una misma
          fila (compactas); si no caben, envuelven a otra línea sin recortar nada. */}
      <KpiGroup
        titulo="Dashboard"
        accion={
          <span className="flex items-center gap-2 font-normal">
            {ultimaActualizacion && (
              <span>
                Última actualización:{" "}
                <span className="tabular-nums">
                  {formatearFechaHoraCompleta(ultimaActualizacion, pais.codigo)}
                </span>
              </span>
            )}
            <Tooltip texto="Actualizar desde Dropi">
              <a
                href={`http://localhost:4321/actualizar-saldo-rapido?pais=${pais.codigo.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Actualizar retiros desde Dropi"
                className="inline-flex items-center justify-center rounded-md border border-border bg-card p-1 text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ActualizarIcon className="h-3.5 w-3.5" />
              </a>
            </Tooltip>
          </span>
        }
      >
        <KpiGrid compacta>
          {(plataformas ?? []).map((p) => {
            const ultimo = ultimoSaldoPorPlataforma.get(p.id);
            const esAutomatico = p.nombre === "Dropi";
            return (
              <KpiCard
                key={p.id}
                compacta
                titulo={esAutomatico ? "Saldo de wallet" : `Saldo de ${p.nombre}`}
                valor={
                  <span className="inline-flex items-center gap-1.5">
                    {esAutomatico && <WalletIcon className="h-4 w-4 text-muted-foreground" />}
                    {ultimo ? formatearMoneda(ultimo.monto, pais.codigo) : "Sin registrar"}
                  </span>
                }
                subtexto={esAutomatico ? undefined : ultimo ? `al ${formatearFecha(ultimo.fecha)}` : undefined}
              />
            );
          })}
          <TarjetasResumenRetiros
            abiertos={abiertos}
            conNovedad={conNovedad}
            cerradosDelMes={formatearMoneda(totalCerradoMes, pais.codigo)}
            cantidadCerradosDelMes={cerradosDelMes.length}
            cerrados={cerrados}
            totalRetiros={totalRetiros}
            mesDesde={`${mesActual}-01`}
            mesHasta={ultimoDiaDelMes}
          />
        </KpiGrid>
      </KpiGroup>

      <div>
        <TablaRetiros
          retiros={filasRetiro}
          codigoPais={pais.codigo}
          paisId={pais.id}
          plataformas={plataformasParaCrear}
          cuentas={cuentasRetiro ?? []}
          miNombre={usuario.nombre ?? usuario.email}
          puedeEscribir={!usuario.modulosSoloLectura.includes("retiros")}
        />
      </div>
    </Pagina>
  );
}
