import type { ReactNode } from "react";
import { ContadorBandeja } from "./contador-bandeja";

/** CRM Dropshippers: lo común a todas sus pestañas (por ahora, el globo de chats sin responder en la pestaña «Bandeja de WhatsApp»). */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ContadorBandeja />
      {children}
    </>
  );
}
