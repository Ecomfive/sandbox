import type { ReactNode } from "react";
import "./tu-winner.css";

/** Las pestañas de Tu Winner con el diseño del boceto aprobado (fondo, tarjetas y etiquetas propias, dentro de `.tw`). */
export default function TuWinnerLayout({ children }: { children: ReactNode }) {
  return <div className="tw">{children}</div>;
}
