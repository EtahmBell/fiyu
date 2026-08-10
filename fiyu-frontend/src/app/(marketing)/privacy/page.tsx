import type { Metadata } from "next";

import {
  LegalDocument,
  LegalList,
  LegalSection,
  LegalSubsection,
} from "@/components/public-site/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Fiyu collects, uses, stores, and discloses information.",
};

const sections = [
  { href: "#information-we-collect", label: "1. Information We Collect" },
  { href: "#how-we-use-information", label: "2. How We Use Information" },
  { href: "#artificial-intelligence", label: "3. Artificial Intelligence and Restaurant Research" },
  { href: "#how-we-disclose-information", label: "4. How We Disclose Information" },
  { href: "#cookies-and-local-storage", label: "5. Cookies, Local Storage, and Similar Technologies" },
  { href: "#your-choices", label: "6. Your Choices and Controls" },
  { href: "#data-retention", label: "7. Data Retention" },
  { href: "#public-and-private", label: "8. Public and Private Information" },
  { href: "#security", label: "9. Security" },
  { href: "#children", label: "10. Children" },
  { href: "#third-party-services", label: "11. Third-Party Websites and Services" },
  { href: "#united-states-operation", label: "12. United States Operation" },
  { href: "#changes", label: "13. Changes to This Privacy Policy" },
  { href: "#contact", label: "14. Contact Us" },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy Policy"
      intro="Fiyu is operated by Ethan Bell, operating as Fiyu (“Fiyu,” “we,” “us,” or “our”). This Privacy Policy explains how we collect, use, store, and disclose information when you use Fiyu’s websites, applications, and related services (collectively, the “Service”)."
      sections={sections}
      relatedHref="/terms"
      relatedLabel="Terms of Service"
    >
      <p className="border-b border-line py-8 text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">
        If you have questions about this Privacy Policy or your information, contact us at <strong className="font-semibold text-ink">fiyu.co@gmail.com</strong>.
      </p>

      <LegalSection id="information-we-collect" title="1. Information We Collect">
        <LegalSubsection title="Account Information">
          <p>When you create a Fiyu account, we may collect information such as:</p>
          <LegalList>
            <li>your email address;</li>
            <li>username;</li>
            <li>display name;</li>
            <li>profile biography;</li>
            <li>profile image; and</li>
            <li>account creation and update information.</li>
          </LegalList>
          <p>Passwords and authentication credentials are managed through our authentication provider. Fiyu does not store your password in its application database.</p>
        </LegalSubsection>

        <LegalSubsection title="Location Information">
          <p>Fiyu uses location to help provide restaurant discoveries relevant to where you are or where you plan to explore.</p>
          <p>We request access to your device location only when you choose to use a location-based feature. Fiyu does not continuously monitor your location or track your location in the background.</p>
          <p>If you are signed in and use your current location while within a supported Fiyu area, your current coordinates may be saved as your active discovery location so that your restaurant Picks can work across devices.</p>
          <p>If Fiyu determines that you are outside a supported area, the coordinates used to make that determination are not retained as your discovery location. We may retain the time at which the location check occurred.</p>
          <p>If you manually choose an area, such as a Tokyo neighborhood or station, we save the selected area and its associated coordinates as your discovery location. You may also optionally provide an arrival date.</p>
          <p>Fiyu does not maintain a history of your movements through the location feature described above. Your active discovery location may be replaced when you choose a new one.</p>
        </LegalSubsection>

        <LegalSubsection title="Restaurant Activity">
          <p>Depending on the features you use, Fiyu may store information about your interactions with restaurants, including:</p>
          <LegalList>
            <li>restaurants that have been shown or surfaced to you;</li>
            <li>restaurants you save;</li>
            <li>Lists you create and the restaurants in those Lists;</li>
            <li>restaurants you record as having visited;</li>
            <li>visit dates;</li>
            <li>reactions such as <strong className="font-semibold text-ink">Love it</strong>, <strong className="font-semibold text-ink">Like it</strong>, or <strong className="font-semibold text-ink">Not for me</strong>; and</li>
            <li>private notes you add to visits.</li>
          </LegalList>
          <p>Your private visit notes are associated with your account and may be available across your signed-in devices. They are not currently displayed to other users.</p>
        </LegalSubsection>

        <LegalSubsection title="Profile Images">
          <p>If you upload a profile image while signed in, Fiyu stores a processed version of the image through our storage provider.</p>
          <p>Although Fiyu does not currently provide public user profiles, authenticated profile images are stored using a publicly accessible image URL. This means someone who obtains the image URL may be able to access the image.</p>
        </LegalSubsection>

        <LegalSubsection title="Signed-Out Use">
          <p>Some Fiyu features may be available without an account.</p>
          <p>When you use these features while signed out, Fiyu may create a browser-generated identifier to associate information such as Picks, Lists, Saves, visits, reactions, or notes with that browser.</p>
          <p>This identifier is not the same as an authenticated Fiyu account.</p>
          <p>Fiyu may also use browser storage to maintain interface state, preferences, and signed-out information. Clearing browser storage may prevent your browser from reconnecting with signed-out activity previously associated with that identifier.</p>
        </LegalSubsection>

        <LegalSubsection title="Contact Information">
          <p>If you contact us through Fiyu, we may collect:</p>
          <LegalList>
            <li>your name;</li>
            <li>email address;</li>
            <li>the contents of your message; and</li>
            <li>related submission information.</li>
          </LegalList>
        </LegalSubsection>

        <LegalSubsection title="Technical Information">
          <p>Our systems and service providers may automatically process limited technical information necessary to operate and secure the Service, such as request information, device or browser information, IP addresses, authentication-session information, and error information.</p>
          <p>Fiyu does not currently use advertising pixels, session replay tools, or third-party behavioral analytics services.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection id="how-we-use-information" title="2. How We Use Information">
        <p>We may use information we collect to:</p>
        <LegalList>
          <li>create, authenticate, and maintain your account;</li>
          <li>provide and personalize restaurant discoveries;</li>
          <li>determine the geographic area relevant to your Picks;</li>
          <li>maintain your Saves, Lists, visit history, reactions, and notes;</li>
          <li>remember which restaurants have already been surfaced to you;</li>
          <li>synchronize account information across devices;</li>
          <li>respond to support and contact requests;</li>
          <li>operate, maintain, debug, and secure Fiyu;</li>
          <li>prevent misuse, fraud, or unauthorized access;</li>
          <li>develop and improve Fiyu; and</li>
          <li>comply with applicable legal obligations.</li>
        </LegalList>
        <p>We do not use your precise location for advertising.</p>
      </LegalSection>

      <LegalSection id="artificial-intelligence" title="3. Artificial Intelligence and Restaurant Research">
        <p>Fiyu uses artificial intelligence tools, including services provided by OpenAI, to assist with internal restaurant research, enrichment, description generation, localization, and related administrative workflows.</p>
        <p>Under Fiyu&apos;s current implementation, these workflows concern restaurant and catalog information. Fiyu does <strong className="font-semibold text-ink">not</strong> send your account information, profile information, device location, discovery location, Lists, Saves, visits, private notes, reactions, or user identifier to OpenAI as part of these restaurant-research workflows.</p>
        <p>If we later introduce user-facing AI features that process personal information, we will update this Privacy Policy as appropriate.</p>
      </LegalSection>

      <LegalSection id="how-we-disclose-information" title="4. How We Disclose Information">
        <p>We may disclose information in the following circumstances.</p>
        <LegalSubsection title="Service Providers">
          <p>We use service providers to operate Fiyu, including providers that support authentication, database hosting, file and profile-image storage, email verification and password reset, restaurant research, restaurant images and related restaurant information, and infrastructure necessary to operate the Service.</p>
          <p>For example, Fiyu currently uses <strong className="font-semibold text-ink">Supabase</strong> for authentication and authenticated account-data storage.</p>
          <p>Service providers may process information on our behalf according to their own contractual and legal obligations.</p>
        </LegalSubsection>
        <LegalSubsection title="Maps and External Services">
          <p>Fiyu may provide links to Google Maps and Apple Maps for restaurant destinations. When you choose to open one of those links, restaurant destination information is included in the request and you leave Fiyu for the applicable third-party service.</p>
          <p>Fiyu does not include your device location or saved Fiyu discovery location in those restaurant map links.</p>
          <p>Restaurant images may also be delivered through third-party image infrastructure. When third-party content loads, the relevant provider may receive ordinary network information such as your IP address, browser information, or referrer.</p>
        </LegalSubsection>
        <LegalSubsection title="Legal, Safety, and Security">
          <p>We may disclose information if reasonably necessary to comply with applicable law, protect the security or integrity of Fiyu, investigate fraud, abuse, or security incidents, or protect the rights, property, or safety of Fiyu, our users, or others.</p>
        </LegalSubsection>
        <LegalSubsection title="Business Transfers">
          <p>If Fiyu is involved in a merger, acquisition, financing, reorganization, sale of assets, or similar business transaction, information may be transferred as part of that transaction subject to applicable law.</p>
        </LegalSubsection>
        <LegalSubsection title="No Sale of Personal Information">
          <p>Fiyu does not currently sell your personal information or use your personal information for targeted advertising.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection id="cookies-and-local-storage" title="5. Cookies, Local Storage, and Similar Technologies">
        <p>Fiyu currently relies primarily on browser storage rather than advertising or marketing cookies.</p>
        <p>Browser storage may be used for authentication sessions, account-scoped Picks state, signed-out user identifiers, interface preferences, profile state for signed-out use, and temporary navigation or restoration state.</p>
        <p>Fiyu does not currently use third-party advertising cookies, advertising pixels, or cross-site behavioral analytics tools.</p>
        <LegalSubsection title="Do Not Track">
          <p>Some browsers offer “Do Not Track” or similar signals.</p>
          <p>Because Fiyu does not currently engage in cross-site behavioral tracking for advertising purposes, Fiyu does not take a separate action in response to traditional browser Do Not Track signals.</p>
          <p>Third-party services that you independently access through Fiyu, such as external map services, may process information according to their own privacy practices.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection id="your-choices" title="6. Your Choices and Controls">
        <p>Depending on the feature, Fiyu allows you to edit your profile information, change or remove your profile image, manage Saves, create/edit/delete eligible Lists, edit or delete visit records, change reactions and private notes, change your discovery location, and delete your Fiyu account from within the Service.</p>
        <LegalSubsection title="Account Deletion">
          <p>You may initiate account deletion from Fiyu&apos;s account settings.</p>
          <p>Deleting your account is intended to permanently remove your Fiyu account and associated active account data, including your profile, Lists and Saves, visit history, reactions and notes, discovery location, recommendation/seen history, and profile image.</p>
          <p>Some information may remain temporarily in backups, caches, security records, or other systems where immediate deletion is not technically practical or where retention is reasonably necessary for legal, fraud-prevention, dispute-resolution, or security purposes.</p>
          <p>Deleting your account does not necessarily remove information that is not associated with your Fiyu account, such as a contact request that we must reasonably retain to respond to or document a prior communication.</p>
          <p>For other privacy questions or requests concerning your information, contact <strong className="font-semibold text-ink">fiyu.co@gmail.com</strong>.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection id="data-retention" title="7. Data Retention">
        <p>We generally retain account information for as long as your account remains active or as reasonably necessary to provide the Service.</p>
        <p>When you delete individual information through available Fiyu controls, we remove it from active application data in accordance with the relevant feature.</p>
        <p>When you delete your account, we delete account-associated active data as described above, subject to reasonable backup, caching, security, fraud-prevention, dispute-resolution, and legal-retention needs.</p>
        <p>Contact messages may be retained for as long as reasonably necessary to respond to the inquiry, provide support, maintain appropriate business records, or address legal or security issues.</p>
        <p>Fiyu does not currently maintain a fixed retention period for all signed-out activity associated with browser-generated identifiers.</p>
      </LegalSection>

      <LegalSection id="public-and-private" title="8. Public and Private Information">
        <p>Fiyu does not currently provide public user profiles, public Lists, or public visit histories.</p>
        <p>Your Lists, Saves, visit records, reactions, and private notes are currently treated as private account information.</p>
        <p>As explained above, profile images for signed-in users may be hosted at a publicly accessible image URL even though Fiyu does not currently expose a public profile.</p>
        <p>If Fiyu later introduces public profiles, social sharing, public reviews, public reactions, or similar community features, we will update our disclosures and provide appropriate controls before treating information that is currently private as public.</p>
      </LegalSection>

      <LegalSection id="security" title="9. Security">
        <p>We use reasonable technical and organizational measures designed to protect information handled through Fiyu.</p>
        <p>These measures include authenticated account access and access controls intended to restrict account-owned information to the appropriate user.</p>
        <p>However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>
      </LegalSection>

      <LegalSection id="children" title="10. Children">
        <p>Fiyu is intended for users who are <strong className="font-semibold text-ink">13 years of age or older</strong>.</p>
        <p>Fiyu is not directed to children under 13, and we do not knowingly collect personal information from children under 13.</p>
        <p>If you believe a child under 13 has provided personal information to Fiyu, contact <strong className="font-semibold text-ink">fiyu.co@gmail.com</strong> so that we can take appropriate action.</p>
      </LegalSection>

      <LegalSection id="third-party-services" title="11. Third-Party Websites and Services">
        <p>Fiyu may link to third-party websites and services, including restaurant websites, Google Maps, and Apple Maps.</p>
        <p>Those services are not controlled by Fiyu, and their privacy practices are governed by their own policies.</p>
      </LegalSection>

      <LegalSection id="united-states-operation" title="12. United States Operation">
        <p>Fiyu is operated from the United States.</p>
        <p>Our service providers may process or store information in locations where they operate. By using Fiyu, your information may therefore be processed in jurisdictions other than the place where you are located, subject to applicable law.</p>
      </LegalSection>

      <LegalSection id="changes" title="13. Changes to This Privacy Policy">
        <p>We may update this Privacy Policy as Fiyu changes.</p>
        <p>If we make material changes, we will provide reasonable notice through the Service, by email, by updating this page, or through another appropriate method.</p>
        <p>The “Effective Date” at the top of this Privacy Policy indicates when the current version became effective.</p>
      </LegalSection>

      <LegalSection id="contact" title="14. Contact Us">
        <p>For questions, requests, or concerns about this Privacy Policy or Fiyu&apos;s privacy practices, contact:</p>
        <address className="not-italic">
          <strong className="font-semibold text-ink">Ethan Bell, operating as Fiyu</strong><br />
          <strong className="font-semibold text-ink">Email:</strong> fiyu.co@gmail.com<br />
          <strong className="font-semibold text-ink">United States</strong>
        </address>
      </LegalSection>
    </LegalDocument>
  );
}
