import { SiteHeader } from "@/components/layout/SiteHeader";

/** Application-only chrome. The public landing route never renders this shell. */
export default function ApplicationLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
