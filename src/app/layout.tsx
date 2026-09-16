import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { NavBar } from "@/components/nav";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ecomfive · Gestión de Proveeduría",
  description: "Control administrativo y financiero de proveeduría — Costa Rica y Panamá",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full bg-background text-foreground">
        <Sidebar />
        <div className="flex min-h-full flex-1 flex-col">
          <NavBar />
          {children}
        </div>
      </body>
    </html>
  );
}
