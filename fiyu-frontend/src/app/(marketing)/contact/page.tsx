import type { Metadata } from "next";

import { ContactForm } from "@/components/public-site/ContactForm";
import { PublicEditorialPage } from "@/components/public-site/PublicEditorialPage";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Fiyu with questions, feedback, or restaurant suggestions.",
};

export default function ContactPage() {
  return (
    <PublicEditorialPage
      eyebrow="Contact"
      title="We’d love to hear from you."
      intro="Have feedback, a question, or a restaurant you think we should know about? Send us a note."
      narrow
    >
      <ContactForm />
    </PublicEditorialPage>
  );
}
