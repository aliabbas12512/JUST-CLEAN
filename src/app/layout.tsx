import type { Metadata, Viewport } from "next";
import { brand } from "@/lib/brand";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { dirFor } from "@/lib/i18n/shared";
import { ServiceWorker } from "@/components/site/service-worker";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getI18n();
  return {
    title: { default: `${brand.name[locale]} — ${t.meta.tagline}`, template: `%s · ${brand.name[locale]}` },
    description: t.meta.description,
    applicationName: brand.latinName,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: brand.latinName, statusBarStyle: "default" },
    icons: { apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: brand.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href={
            locale === "ur"
              ? "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap"
              : "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          }
        />
      </head>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
