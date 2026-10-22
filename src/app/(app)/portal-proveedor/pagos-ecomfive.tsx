"use client";

import { useMemo, useState } from "react";
import { claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { IndicadoresEcomfive, TablaPlazos, textoCuota, type AvisoVista, type FilaPlazo } from "@/components/proveedor/pagos-proveedor";
import { Foto, TONO, Tarjeta, Vacio, botonNormal, botonPeligro, botonPrincipal, dinero, fecha } from "@/components/proveedor/piezas-proveedor";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { hoyPanama } from "@/lib/proveedor/fechas";
import type { CuotaPorPagar, ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { BUCKET_PROVEEDOR } from "@/lib/proveedor/rutas";
import { supabase } from "@/lib/supabase/client";
import { cancelarAvisoPago, crearAvisoPago, prepararSubidaComprobante } from "./pagos-actions";

/**
 * «Pagos» del Portal del proveedor (lado de Ecomfive, fase 4): cumplimiento, lo que falta pagar con su vencimiento, el aviso de pago a
 * Chin (fecha, referencia, comprobante y a qué cuotas va) y los avisos enviados. Lo pagado cuenta cuando Chin lo confirma.
 */
export function PagosEcomfive({
  nombre,
  resumen,
  porPagar: inicial,
  avisos: avisosIniciales,
  plazos,
  puedeEscribir,
}: {
  nombre: string;
  resumen: ResumenPagos;
  porPagar: CuotaPorPagar[];
  avisos: AvisoVista[];
  plazos: FilaPlazo[];
  puedeEscribir: boolean;
}) {
  const { mostrarToast } = useToast();
  const [porPagar, setPorPagar] = useState(inicial);
  const [avisos, setAvisos] = useState(avisosIniciales);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [avisando, setAvisando] = useState(false);
  const elegidas = useMemo(() => porPagar.filter((c) => marcadas.has(c.clave)), [porPagar, marcadas]);
  const total = elegidas.reduce((s, c) => s + c.monto, 0);

  function alternar(clave: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  }

  return (
    <>
      <IndicadoresEcomfive r={resumen} />

      <Tarjeta
        titulo="Por pagar"
        accion={
          puedeEscribir ? (
            <span className="flex items-center gap-2">
              {elegidas.length > 0 && <span className="text-[13px] text-muted-foreground tabular-nums">{elegidas.length} cuotas · {dinero(total, 2)}</span>}
              <button type="button" className={botonPrincipal} disabled={!elegidas.length} onClick={() => setAvisando(true)}>
                Avisar pago a {nombre}
              </button>
            </span>
          ) : undefined
        }
      >
        {porPagar.length === 0 ? (
          <Vacio>No hay nada por pagar.</Vacio>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr>
                  {puedeEscribir && (
                    <th scope="col" className={claseThLista}>
                      <span className="sr-only">Incluir en el aviso</span>
                    </th>
                  )}
                  <th scope="col" className={claseThLista}>Producto</th>
                  <th scope="col" className={claseThLista}>País</th>
                  <th scope="col" className={claseThLista}>Cuota</th>
                  <th scope="col" className={claseThLista}>Vence</th>
                  <th scope="col" className={`${claseThLista} text-right`}>Monto</th>
                  <th scope="col" className={claseThLista}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {porPagar.map((c) => (
                  <tr key={c.clave} className={marcadas.has(c.clave) ? "bg-primario-suave/50" : ""}>
                    {puedeEscribir && (
                      <td className={claseTdLista}>
                        <input
                          type="checkbox"
                          checked={marcadas.has(c.clave)}
                          disabled={c.avisada}
                          onChange={() => alternar(c.clave)}
                          aria-label={`Incluir el ${c.cuota} de ${c.producto} en el aviso`}
                          className={`h-4 w-4 accent-[var(--primario)] ${anilloFoco}`}
                        />
                      </td>
                    )}
                    <td className={claseTdLista}>
                      <span className="flex min-w-[14rem] items-center gap-2.5">
                        <Foto url={c.fotoReferencia} nombre={c.producto} />
                        <span className="min-w-0 whitespace-normal">
                          <span className="block">{c.producto}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {c.referencia ? `${c.referencia} · ` : ""}enviado {fecha(c.fechaEnvio)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={`${claseTdLista} font-semibold tabular-nums`}>{c.paisCodigo ?? "—"}</td>
                    <td className={claseTdLista}>{c.cuota === "anticipo" ? "50 % · 10 días del envío" : "50 % · a la llegada"}</td>
                    <td className={`${claseTdLista} tabular-nums`}>{fecha(c.vence)}</td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(c.monto, 2)}</td>
                    <td className={claseTdLista}>{c.avisada ? <Badge tone="info">Avisado · espera a {nombre}</Badge> : <Badge tone={TONO[c.estado.tono]}>{c.estado.texto}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {avisos.length > 0 && (
        <Tarjeta titulo="Avisos de pago enviados">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr>
                  {["Fecha", "Referencia", "Monto", "Cuotas", "Comprobante", "Estado", ""].map((t, i) => (
                    <th key={i} scope="col" className={`${claseThLista} ${t === "Monto" ? "text-right" : ""}`}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {avisos.map((a) => (
                  <FilaAviso
                    key={a.id}
                    a={a}
                    nombre={nombre}
                    puedeEscribir={puedeEscribir}
                    alCancelar={() => {
                      setAvisos((xs) => xs.filter((x) => x.id !== a.id));
                      const claves = new Set(a.cuotas.map((c) => `${c.pedidoId}:${c.cuota}`));
                      setPorPagar((xs) => xs.map((c) => (claves.has(c.clave) ? { ...c, avisada: false } : c)));
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      <TablaPlazos filas={plazos} titulo="Plazos de pago · últimos 60 envíos" nota={`Cuenta como pagado cuando ${nombre} lo confirma (y lo que trae su hoja de pagos)`} />

      {avisando && (
        <PanelAviso
          nombre={nombre}
          cuotas={elegidas}
          alCerrar={() => setAvisando(false)}
          alEnviar={(aviso) => {
            setAvisos((xs) => [aviso, ...xs]);
            const claves = new Set(elegidas.map((c) => c.clave));
            setPorPagar((xs) => xs.map((c) => (claves.has(c.clave) ? { ...c, avisada: true } : c)));
            setMarcadas(new Set());
            setAvisando(false);
            mostrarToast(`Aviso enviado: ${nombre} lo verá en Pagos para confirmarlo.`);
          }}
        />
      )}
    </>
  );
}

function FilaAviso({ a, nombre, puedeEscribir, alCancelar }: { a: AvisoVista; nombre: string; puedeEscribir: boolean; alCancelar: () => void }) {
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  return (
    <tr>
      <td className={`${claseTdLista} tabular-nums`}>{fecha(a.fecha)}</td>
      <td className={`${claseTdLista} tabular-nums`}>{a.referencia ?? "—"}</td>
      <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(a.monto, 2)}</td>
      <td className={`${claseTdLista} max-w-[20rem] whitespace-normal text-xs text-muted-foreground`}>{a.cuotas.map((c) => `${c.producto} (${c.cuota})`).join(" · ")}</td>
      <td className={claseTdLista}>
        {a.comprobanteUrl ? (
          <a href={a.comprobanteUrl} target="_blank" rel="noreferrer" className={`rounded text-[13px] underline-offset-2 hover:underline ${anilloFoco}`}>
            Ver
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className={claseTdLista}>
        {a.estado === "avisado" ? <Badge tone="info">Esperando a {nombre}</Badge> : <Badge tone="success">Confirmado {a.confirmadoEn ? fecha(a.confirmadoEn.slice(0, 10)) : ""}</Badge>}
        {a.nota && <span className="block text-xs text-muted-foreground">«{a.nota}»</span>}
      </td>
      <td className={`${claseTdLista} text-right`}>
        {puedeEscribir && a.estado === "avisado" && (
          confirmar ? (
            <span className="inline-flex gap-1.5">
              <button type="button" className={botonNormal} disabled={ocupado} onClick={() => setConfirmar(false)}>
                No
              </button>
              <button
                type="button"
                className={botonPeligro}
                disabled={ocupado}
                onClick={async () => {
                  setOcupado(true);
                  const r = await cancelarAvisoPago(a.id);
                  setOcupado(false);
                  if (r.error) return mostrarToast(r.error, "destructive");
                  alCancelar();
                  mostrarToast("Aviso cancelado.");
                }}
              >
                Sí, cancelar
              </button>
            </span>
          ) : (
            <button type="button" className={botonNormal} onClick={() => setConfirmar(true)}>
              Cancelar aviso
            </button>
          )
        )}
      </td>
    </tr>
  );
}

function PanelAviso({ nombre, cuotas, alCerrar, alEnviar }: { nombre: string; cuotas: CuotaPorPagar[]; alCerrar: () => void; alEnviar: (a: AvisoVista) => void }) {
  const hoy = useMemo(() => hoyPanama(), []);
  const [f, setF] = useState(hoy);
  const [referencia, setReferencia] = useState("");
  const [comprobante, setComprobante] = useState<{ ruta: string; nombre: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = cuotas.reduce((s, c) => s + c.monto, 0);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    if (archivo.size > 10 * 1024 * 1024) return setError("El comprobante pesa más de 10 MB.");
    setSubiendo(true);
    const permiso = await prepararSubidaComprobante(archivo.name);
    if ("error" in permiso) {
      setSubiendo(false);
      return setError(permiso.error);
    }
    const { error: e } = await supabase.storage.from(BUCKET_PROVEEDOR).uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type || "application/octet-stream" });
    setSubiendo(false);
    if (e) return setError("No se pudo subir el comprobante. Inténtalo de nuevo.");
    setComprobante({ ruta: permiso.ruta, nombre: archivo.name });
  }

  async function enviar() {
    setError(null);
    setEnviando(true);
    const r = await crearAvisoPago({ fecha: f, referencia, claves: cuotas.map((c) => c.clave), comprobanteRuta: comprobante?.ruta ?? null });
    setEnviando(false);
    if (r.error || !r.avisoId) return setError(r.error ?? "No se pudo enviar el aviso.");
    alEnviar({
      id: r.avisoId,
      fecha: f,
      monto: Math.round(total * 100) / 100,
      referencia: referencia.trim() || null,
      estado: "avisado",
      avisadoPor: null,
      confirmadoEn: null,
      nota: null,
      comprobanteUrl: null,
      cuotas: cuotas.map((c) => ({ pedidoId: c.pedidoId, cuota: c.cuota, monto: c.monto, producto: c.producto })),
    });
  }

  return (
    <Ventana abierto alCerrar={() => !enviando && !subiendo && alCerrar()} lado="derecha" ancho="md" titulo={<span className="text-base font-semibold">Avisar pago a {nombre}</span>}>
      <div className="flex flex-col gap-4 p-4">
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-muted-foreground">Cuotas</dt>
          <dd className="m-0 font-medium tabular-nums">{cuotas.length}</dd>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="m-0 font-semibold tabular-nums">{dinero(total, 2)}</dd>
        </dl>
        <ul className="m-0 flex flex-col gap-1 p-0 pl-4 text-[13px]">
          {cuotas.map((c) => (
            <li key={c.clave}>
              {c.producto} · {textoCuota(c.cuota)} · <span className="tabular-nums">{dinero(c.monto, 2)}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Fecha del pago</span>
            <input type="date" value={f} max={hoy} onChange={(e) => setF(e.target.value)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Referencia</span>
            <input value={referencia} maxLength={80} onChange={(e) => setReferencia(e.target.value)} placeholder="Ej: TRF-88213" data-enfocar className={fieldClass} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Comprobante</span>
          <input type="file" accept="image/*,application/pdf" disabled={subiendo || enviando} onChange={(e) => subir(e.target.files?.[0])} className="text-[13px]" />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {subiendo ? "Subiendo…" : comprobante ? `Listo: ${comprobante.nombre}` : "Imagen o PDF, hasta 10 MB (opcional)."}
          </span>
        </label>
        <p className="m-0 text-xs text-muted-foreground">
          {nombre} recibe el aviso con el reparto por producto y lo confirma; recién ahí queda pagado.
        </p>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={botonNormal} disabled={enviando || subiendo} onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className={botonPrincipal} disabled={enviando || subiendo} onClick={enviar}>
            {enviando ? "Enviando…" : "Enviar aviso"}
          </button>
        </div>
      </div>
    </Ventana>
  );
}
