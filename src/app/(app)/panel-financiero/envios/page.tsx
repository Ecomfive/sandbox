import Link from "next/link";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, hoyPanama, mesLargo } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarDestinatarios } from "@/lib/finanzas/cargar-informe-envio";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { DIA_INFORME, configWhatsapp, mesAInformar } from "@/lib/finanzas/informe-envio";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonEnviarInforme, BotonResumenSemanal } from "./botones-envio";

export const metadata = { title: "Envíos" };

export const dynamic = "force-dynamic";
// «Enviar ahora» arma el informe y espera la respuesta del correo.
export const maxDuration = 60;

interface Envio {
  id: string;
  canal: "correo" | "whatsapp";
  periodo: string;
  destinatarios: string[];
  ok: boolean;
  detalle: string | null;
  disparo: string;
  creado_en: string;
  version_id: string | null;
}

const enlace = `text-sm underline underline-offset-2 ${anilloFoco}`;

export default async function EnviosPage() {
  const usuario = await requireModulo("panel-financiero");
  const puedeEnviar = usuario.modulos.includes("estado-resultados") && !usuario.modulosSoloLectura.includes("estado-resultados");
  if (!veTodaLaEmpresa(await cargarTiendasPermitidas())) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Envíos" oculto />
        <EstadoVacioAF4 titulo="Los informes son de toda la empresa" />
      </Pagina>
    );
  }
  const supabase = createServiceClient();
  const [dest, envios] = await Promise.all([
    cargarDestinatarios(supabase),
    supabase.from("fin_informes_envios").select("id, canal, periodo, destinatarios, ok, detalle, disparo, creado_en, version_id").order("creado_en", { ascending: false }).limit(60),
  ]);
  if ("error" in dest || envios.error) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Envíos" oculto />
        <EstadoVacioAF4 titulo="Los envíos todavía no están instalados">Falta correr la migración 0937 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const lista = (envios.data ?? []) as Envio[];
  const correoListo = !!process.env.RESEND_API_KEY;
  const whatsappAuto = configWhatsapp(process.env) !== null;
  const mes = mesAInformar(hoyPanama());
  const ultimoCorreo = lista.find((e) => e.canal === "correo");
  const ultimoWa = lista.find((e) => e.canal === "whatsapp");

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Envíos" actualizado={lista[0]?.creado_en ?? null} imprimir={false} />

      <div className="grid gap-6 md:grid-cols-2">
        <MarcoAF4 id="envio-correo" titulo="Informe mensual por correo" detalle={`El día ${DIA_INFORME} · ${mesLargo(mes)}`}>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Destinatarios</dt>
            <dd className="m-0 flex items-center gap-1.5 tabular-nums">
              {!dest.correos.length && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
              {entero(dest.correos.length)}
            </dd>
            <dt className="text-muted-foreground">Correo</dt>
            <dd className="m-0 flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${correoListo ? "bg-success" : "bg-warning"}`} />
              {correoListo ? "Configurado" : "Falta RESEND_API_KEY"}
            </dd>
            <dt className="text-muted-foreground">Último</dt>
            <dd className="m-0">{ultimoCorreo ? `${fechaHora(ultimoCorreo.creado_en)} · ${ultimoCorreo.ok ? "enviado" : "falló"}` : "—"}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Link href="/estado-resultados/ajustes#destinatarios" className={enlace}>
              Destinatarios
            </Link>
            {puedeEnviar && <BotonEnviarInforme mes={null} deshabilitado={!correoListo} />}
          </div>
        </MarcoAF4>

        <MarcoAF4 id="envio-whatsapp" titulo="Resumen semanal por WhatsApp" detalle="Los lunes">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Números</dt>
            <dd className="m-0 tabular-nums">{entero(dest.telefonos.length)}</dd>
            <dt className="text-muted-foreground">Envío</dt>
            <dd className="m-0 flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${whatsappAuto ? "bg-success" : "bg-muted-foreground"}`} />
              {whatsappAuto ? "Automático" : "A mano (wa.me)"}
            </dd>
            <dt className="text-muted-foreground">Último</dt>
            <dd className="m-0">{ultimoWa ? `${fechaHora(ultimoWa.creado_en)} · ${ultimoWa.ok ? "enviado" : "falló"}` : "—"}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Link href="/panel-financiero/versiones?tipo=semanal" className={enlace}>
              Resúmenes anteriores
            </Link>
            {puedeEnviar && <BotonResumenSemanal automatico={whatsappAuto} />}
          </div>
        </MarcoAF4>
      </div>

      <MarcoAF4 id="envios-registro" titulo="Registro de envíos" detalle={entero(lista.length)} sinRelleno>
        {lista.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Todavía no se envió ningún informe.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {lista.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.ok ? "bg-success" : "bg-destructive"}`} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm">
                    <span className="sr-only">{e.ok ? "Enviado: " : "Falló: "}</span>
                    {e.canal === "correo" ? "Correo" : "WhatsApp"} · {e.canal === "correo" ? mesLargo(String(e.periodo)) : `semana del ${String(e.periodo).slice(0, 10)}`} · {entero(e.destinatarios.length)}{" "}
                    {e.destinatarios.length === 1 ? "destinatario" : "destinatarios"}
                  </p>
                  <p className="m-0 text-xs text-muted-foreground">
                    {fechaHora(e.creado_en)} · {e.disparo === "cron" ? "Programado" : "A mano"}
                    {e.detalle ? ` · ${e.detalle}` : ""}
                  </p>
                </div>
                {e.version_id && (
                  <Link href={`/panel-financiero/versiones/${e.version_id}`} className={`text-xs underline underline-offset-2 ${anilloFoco}`}>
                    Ver lo enviado
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </MarcoAF4>
    </Pagina>
  );
}
