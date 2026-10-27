import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { accesoCrm, areasVisibles, MODULO_DIRECCION } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaKpis, type KpisWhatsapp } from "./vista-kpis";

export const metadata = { title: "KPIs de atención" };

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

/**
 * CRM › KPIs de atención (27 oct 2026, para el CEO, módulo `crm-direccion`): tiempo de respuesta, consultas sin responder y volumen por
 * número y por persona, de la Bandeja de WhatsApp. Los calcula `whatsapp_kpis` (migración 0164) en la base.
 */
export default async function KpisAtencionPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo(MODULO_DIRECCION);
  const { dias: diasParam } = await searchParams;
  const dias = PERIODOS.includes(Number(diasParam)) ? Number(diasParam) : 7;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createServiceClient().rpc("whatsapp_kpis", { p_desde: desde, p_areas: areasVisibles(accesoCrm(usuario)) });
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="KPIs de atención" oculto>
        Cómo se están atendiendo los chats de WhatsApp: tiempos de respuesta, consultas sin responder y volumen por número y por persona.
      </EncabezadoPagina>
      {error ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          Falta correr la migración 0164 (KPIs de WhatsApp) en la base.
        </p>
      ) : (
        <VistaKpis datos={data as KpisWhatsapp} dias={dias} periodos={PERIODOS} />
      )}
    </Pagina>
  );
}
