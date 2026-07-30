import {
  CityEditionPreview,
  type CityEditionPreviewModel,
} from "@/components/landing-page/CityEditionPreview";

const tokyoEdition: CityEditionPreviewModel = {
  cityId: "tokyo",
  cityName: "Tokyo",
  imageSrc: "/og.png",
  imageAlt: "Fiyu Tokyo edition artwork with a map marker over Japan.",
  imageWidth: 1200,
  imageHeight: 630,
  eyebrow: "Now exploring: Tokyo",
  heading: "Meet the city beyond the obvious.",
  description:
    "Fiyu selects restaurants around your current or chosen area and personal tastes, giving you a thoughtful way to explore what is close by.",
  destination: "/picks",
};

export function TokyoPreview() {
  return (
    <section id="tokyo-preview" className="overflow-hidden bg-plum text-white">
      <CityEditionPreview edition={tokyoEdition} />
      <style>{`
        @keyframes fiyu-signature-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .landing-tokyo-signature { animation: fiyu-signature-in 700ms var(--ease-fiyu) both; }
        @media (prefers-reduced-motion: reduce) {
          .landing-tokyo-signature { animation: none; }
        }
      `}</style>
    </section>
  );
}
