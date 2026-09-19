import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ecomfive Business OS",
  description: "Gestión operativa, financiera y de inteligencia competitiva de Ecomfive por país y plataforma",
};

const SCRIPT_TEMA = `
try {
  var tema = localStorage.getItem("tema");
  if (tema === "dark") document.documentElement.dataset.theme = "dark";
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${manrope.variable} h-full antialiased`}>
      <head>
        {/* Antes del primer pintado, para que no haya parpadeo claro->oscuro al cargar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
