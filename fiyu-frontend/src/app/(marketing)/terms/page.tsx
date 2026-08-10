import type { Metadata } from "next";
import Link from "next/link";

import {
  LegalDocument,
  LegalList,
  legalInlineLink,
  LegalSection,
} from "@/components/public-site/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing access to and use of Fiyu.",
};

const sections = [
  { href: "#eligibility", label: "1. Eligibility" },
  { href: "#what-fiyu-does", label: "2. What Fiyu Does" },
  { href: "#accounts", label: "3. Accounts" },
  { href: "#acceptable-use", label: "4. Acceptable Use" },
  { href: "#your-content", label: "5. Your Content" },
  { href: "#restaurant-information", label: "6. Restaurant Information and Recommendations" },
  { href: "#food-allergies", label: "7. Food, Allergies, and Dietary Information" },
  { href: "#location-features", label: "8. Location Features" },
  { href: "#third-party-services", label: "9. Third-Party Services" },
  { href: "#intellectual-property", label: "10. Intellectual Property" },
  { href: "#privacy", label: "11. Privacy" },
  { href: "#service-changes", label: "12. Changes to the Service" },
  { href: "#suspension-and-termination", label: "13. Account Suspension and Termination" },
  { href: "#warranties", label: "14. Disclaimer of Warranties" },
  { href: "#liability", label: "15. Limitation of Liability" },
  { href: "#governing-law", label: "16. Governing Law" },
  { href: "#terms-changes", label: "17. Changes to These Terms" },
  { href: "#severability", label: "18. Severability" },
  { href: "#entire-agreement", label: "19. Entire Agreement" },
  { href: "#contact", label: "20. Contact" },
];

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of Service"
      intro="These Terms of Service (“Terms”) govern your access to and use of Fiyu's websites, applications, and related services (collectively, the “Service”)."
      sections={sections}
      relatedHref="/privacy"
      relatedLabel="Privacy Policy"
    >
      <div className="space-y-4 border-b border-line py-8 text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">
        <p>Fiyu is operated by <strong className="font-semibold text-ink">Ethan Bell, operating as Fiyu</strong> (“Fiyu,” “we,” “us,” or “our”).</p>
        <p>By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use Fiyu.</p>
      </div>

      <LegalSection id="eligibility" title="1. Eligibility">
        <p>You must be at least <strong className="font-semibold text-ink">13 years old</strong> to use Fiyu.</p>
        <p>If you are under the age of majority where you live, you may use Fiyu only with the involvement or permission of a parent or legal guardian where required by applicable law.</p>
        <p>You may not use Fiyu if applicable law prohibits you from doing so.</p>
      </LegalSection>

      <LegalSection id="what-fiyu-does" title="2. What Fiyu Does">
        <p>Fiyu is a restaurant discovery service designed to help users find a curated selection of restaurants.</p>
        <p>Fiyu may provide features such as restaurant Picks, maps and location-based discovery, restaurant information and descriptions, Saves and Lists, visit logging, reactions and private notes, and other restaurant-discovery tools.</p>
        <p>Fiyu may change, add, remove, test, or discontinue features over time.</p>
      </LegalSection>

      <LegalSection id="accounts" title="3. Accounts">
        <p>Some Fiyu features require an account.</p>
        <p>When you create an account, you agree to provide accurate information, keep your login credentials secure, maintain control over the email address associated with your account, and promptly notify us if you believe your account has been compromised.</p>
        <p>You are responsible for activity conducted through your account unless prohibited by applicable law.</p>
        <p>You may not impersonate another person or create an account using information you are not authorized to use.</p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="4. Acceptable Use">
        <p>You agree not to use Fiyu for unlawful, fraudulent, abusive, or deceptive purposes; access another user&apos;s account or private information without authorization; interfere with or disrupt the Service; bypass or attempt to bypass access controls or security measures; scrape, extract, or systematically collect Fiyu content or data except as expressly permitted by us; reverse engineer the Service except to the extent such restriction is prohibited by law; use automated systems to overload, abuse, or manipulate the Service; upload malicious software or code; use Fiyu to violate another person&apos;s intellectual-property, privacy, or other rights; or use Fiyu in a manner that could damage the Service or interfere with another user&apos;s use of it.</p>
        <p>We may take reasonable steps to prevent misuse of Fiyu.</p>
      </LegalSection>

      <LegalSection id="your-content" title="5. Your Content">
        <p>Fiyu may allow you to provide content such as usernames, display names, biographies, profile images, List names, restaurant reactions, and private visit notes.</p>
        <p>You retain ownership of content that you own.</p>
        <p>You grant Fiyu a limited, non-exclusive, worldwide license to host, store, reproduce, process, and display your content only as reasonably necessary to operate, maintain, secure, and improve the Service and provide the features you request.</p>
        <p>This license ends when the relevant content is deleted from our active systems, except to the extent continued retention is reasonably necessary for backups, security, legal compliance, or other legitimate operational purposes.</p>
        <p>You represent that you have the rights necessary to provide content you upload to Fiyu.</p>
        <p>Fiyu does not currently treat private visit notes, private Lists, or private visit history as public user content.</p>
      </LegalSection>

      <LegalSection id="restaurant-information" title="6. Restaurant Information and Recommendations">
        <p>Fiyu is a discovery service. Restaurant information and recommendations are provided for informational purposes.</p>
        <p>Restaurant information may come from a combination of curated records, third-party sources, public information, research, automated processing, and editorial review.</p>
        <p>Restaurants change. Accordingly, Fiyu does not guarantee that information about a restaurant is complete, current, or error-free, including information concerning whether a restaurant is open, address or location, menu items, cuisine, pricing, website or phone information, reservation availability, restaurant status, or other restaurant characteristics.</p>
        <p>You should verify important information directly with the restaurant before relying on it.</p>
        <p>Fiyu scores, rankings, Picks, descriptions, tags, and other recommendations represent Fiyu&apos;s discovery system and editorial or algorithmic judgments. They are not guarantees that you will enjoy a restaurant or have a particular experience.</p>
      </LegalSection>

      <LegalSection id="food-allergies" title="7. Food, Allergies, and Dietary Information">
        <p>Fiyu should not be relied upon as the sole source for food allergy, ingredient, dietary-restriction, or food-safety decisions.</p>
        <p>Menus, ingredients, preparation practices, and cross-contamination risks may change and may not be known to Fiyu.</p>
        <p>If you have an allergy, medical dietary requirement, or other safety-sensitive food restriction, verify appropriate information directly with the restaurant.</p>
      </LegalSection>

      <LegalSection id="location-features" title="8. Location Features">
        <p>Fiyu may use your current location or a manually selected area to provide geographically relevant restaurant discoveries.</p>
        <p>Location results may be approximate or affected by your device, browser, connectivity, permissions, or underlying geographic data.</p>
        <p>You remain responsible for evaluating routes, surroundings, transportation, accessibility, and personal safety when traveling to a restaurant.</p>
        <p>Additional information about Fiyu&apos;s collection and use of location information appears in our <Link href="/privacy" className={legalInlineLink}>Privacy Policy</Link>.</p>
      </LegalSection>

      <LegalSection id="third-party-services" title="9. Third-Party Services">
        <p>Fiyu may display or link to content and services operated by third parties, including restaurant websites, restaurant-image providers, Google Maps, and Apple Maps.</p>
        <p>Third-party services are not controlled by Fiyu. Your use of those services may be subject to separate terms and privacy policies.</p>
        <p>A link, restaurant listing, image, or reference to a third party does not mean Fiyu endorses or guarantees that third party.</p>
        <p>Fiyu is not responsible for the availability, conduct, content, policies, or services of third parties to the extent permitted by law.</p>
      </LegalSection>

      <LegalSection id="intellectual-property" title="10. Intellectual Property">
        <p>The Service, including Fiyu&apos;s software, design, branding, interfaces, selection and arrangement of content, original descriptions, scoring systems, and other Fiyu-created material, is owned by Fiyu or its licensors and is protected by applicable intellectual-property laws.</p>
        <p>These Terms do not transfer ownership of Fiyu intellectual property to you.</p>
        <p>Subject to these Terms, Fiyu grants you a limited, personal, non-exclusive, non-transferable, revocable right to use the Service for its intended personal use.</p>
        <p>Restaurant names, trademarks, logos, photographs, and other third-party materials remain the property of their respective owners where applicable.</p>
      </LegalSection>

      <LegalSection id="privacy" title="11. Privacy">
        <p>Our <Link href="/privacy" className={legalInlineLink}>Privacy Policy</Link> explains how Fiyu handles personal information and is incorporated into your use of the Service.</p>
        <p>By using Fiyu, you acknowledge that your information will be handled as described in the <Link href="/privacy" className={legalInlineLink}>Privacy Policy</Link>.</p>
      </LegalSection>

      <LegalSection id="service-changes" title="12. Changes to the Service">
        <p>Fiyu is an evolving product.</p>
        <p>We may add, modify, limit, test, suspend, or discontinue features or portions of the Service.</p>
        <p>We may also impose or change reasonable usage limits.</p>
        <p>If Fiyu later introduces paid features or subscriptions, applicable pricing and any additional payment or subscription terms will be presented before you purchase them.</p>
      </LegalSection>

      <LegalSection id="suspension-and-termination" title="13. Account Suspension and Termination">
        <p>You may stop using Fiyu at any time.</p>
        <p>You may delete your account through the account settings available within Fiyu.</p>
        <p>We may suspend or terminate access to Fiyu if we reasonably believe that you materially violated these Terms, your use creates a security or legal risk, your account is being used fraudulently or abusively, or suspension or termination is reasonably necessary to protect Fiyu or other users.</p>
        <p>Where appropriate, we may provide notice or an opportunity to address the issue.</p>
        <p>Sections of these Terms that by their nature should survive termination will continue to apply, including provisions concerning intellectual property, disclaimers, limitations of liability, and governing law.</p>
      </LegalSection>

      <LegalSection id="warranties" title="14. Disclaimer of Warranties">
        <p>To the fullest extent permitted by applicable law, Fiyu is provided <strong className="font-semibold text-ink">“as is” and “as available.”</strong></p>
        <p>We do not warrant that the Service will always be available, uninterrupted, secure, or error-free; restaurant information will always be accurate or current; a recommended restaurant will meet your expectations; every restaurant will remain open or available; or every error or defect will be corrected.</p>
        <p>Nothing in these Terms excludes any warranty or right that cannot lawfully be excluded.</p>
      </LegalSection>

      <LegalSection id="liability" title="15. Limitation of Liability">
        <p>To the fullest extent permitted by applicable law, Fiyu and its operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages arising out of or relating to your use of or inability to use the Service.</p>
        <p>This includes, where permitted by law, losses arising from reliance on restaurant information, third-party services, unavailable restaurants, lost data, or interruption of the Service.</p>
        <p>To the fullest extent permitted by applicable law, Fiyu&apos;s aggregate liability arising from or relating to the Service or these Terms will not exceed the greater of:</p>
        <LegalList>
          <li>the amount you paid directly to Fiyu during the twelve months preceding the event giving rise to the claim; or</li>
          <li><strong className="font-semibold text-ink">US $100</strong>.</li>
        </LegalList>
        <p>These limitations do not apply to liability that cannot legally be limited or excluded.</p>
      </LegalSection>

      <LegalSection id="governing-law" title="16. Governing Law">
        <p>These Terms are governed by the laws of the <strong className="font-semibold text-ink">State of Washington</strong>, without regard to conflict-of-laws principles.</p>
        <p>To the extent a dispute may properly be brought in court, you and Fiyu agree to submit to the jurisdiction of courts of competent jurisdiction in the State of Washington, except where applicable law gives you the right to bring a claim elsewhere.</p>
      </LegalSection>

      <LegalSection id="terms-changes" title="17. Changes to These Terms">
        <p>We may update these Terms as Fiyu evolves.</p>
        <p>If we make material changes, we will provide reasonable notice through the Service, by email, by updating this page, or through another appropriate method.</p>
        <p>The updated Terms will identify their effective date.</p>
        <p>Your continued use of Fiyu after revised Terms become effective constitutes acceptance of the revised Terms to the extent permitted by applicable law.</p>
      </LegalSection>

      <LegalSection id="severability" title="18. Severability">
        <p>If any provision of these Terms is found unenforceable, the remaining provisions will remain in effect, and the unenforceable provision will be enforced to the maximum extent permitted by law.</p>
      </LegalSection>

      <LegalSection id="entire-agreement" title="19. Entire Agreement">
        <p>These Terms and the <Link href="/privacy" className={legalInlineLink}>Privacy Policy</Link> constitute the agreement between you and Fiyu concerning your use of the Service, except where additional terms are expressly presented for a particular feature.</p>
      </LegalSection>

      <LegalSection id="contact" title="20. Contact">
        <p>Questions about these Terms may be sent to:</p>
        <address className="not-italic">
          <strong className="font-semibold text-ink">Ethan Bell, operating as Fiyu</strong><br />
          <strong className="font-semibold text-ink">Email:</strong> fiyu.co@gmail.com<br />
          <strong className="font-semibold text-ink">United States</strong>
        </address>
      </LegalSection>
    </LegalDocument>
  );
}
