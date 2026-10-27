import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { BottomNav } from "@/components/site/bottom-nav";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-24 md:pb-10">{children}</main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
