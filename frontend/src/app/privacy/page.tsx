import Link from 'next/link';
import type { Metadata } from 'next';
import PublicFooter from '../../components/PublicFooter';

/*
 * RENKOO — Privacy Policy (public, no authentication required).
 * Product content preparation, not legal advice. Company and
 * legal-identity details that are not defined in the project
 * use clearly marked editable placeholders — no facts invented.
 */

export const metadata: Metadata = {
  title: 'RENKOO Privacy Policy',
  description:
    'How RENKOO collects, uses, stores and protects account, website and Google-connected data.',
};

const SECTIONS = [
  { id: 'introduction', n: '1', title: 'Introduction' },
  { id: 'information-collected', n: '2', title: 'Information collected' },
  { id: 'account', n: '3', title: 'Account information' },
  { id: 'website-project', n: '4', title: 'Website and project information' },
  { id: 'usage', n: '5', title: 'Usage and analytics information' },
  { id: 'cookies', n: '6', title: 'Cookies and local storage' },
  { id: 'google-services', n: '7', title: 'Google services and data' },
  { id: 'google-use', n: '8', title: 'How Google data is used' },
  { id: 'google-sharing', n: '9', title: 'Google user data sharing' },
  { id: 'retention', n: '10', title: 'Data storage and retention' },
  { id: 'security', n: '11', title: 'Security' },
  { id: 'deletion', n: '12', title: 'Account deletion' },
  { id: 'disconnect', n: '13', title: 'Disconnecting Google services' },
  { id: 'rights', n: '14', title: 'User rights' },
  { id: 'children', n: '15', title: "Children's privacy" },
  { id: 'changes', n: '16', title: 'Changes to this policy' },
  { id: 'contact', n: '17', title: 'Contact' },
];

export default function PrivacyPage() {
  return (
    <>
      <a
        href="#privacy-content"
        className="rk-focusable sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-rk-md focus:bg-rk-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-rk-border bg-rk-surface">
        <div className="mx-auto flex h-[60px] max-w-[1100px] items-center gap-3 px-5 lg:px-8">
          <Link
            href="/"
            aria-label="RENKOO home"
            className="rk-focusable flex items-center gap-2.5"
          >
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-rk-md bg-rk-ink text-sm font-black text-white"
            >
              R
            </span>
            <span className="text-[15px] font-extrabold tracking-[-0.02em] text-rk-ink">
              RENKOO
            </span>
          </Link>

          <nav
            aria-label="Public"
            className="ml-auto flex items-center gap-2"
          >
            <Link
              href="/login"
              className="rk-focusable rounded-rk-md px-3 py-2 text-[13px] font-bold text-rk-secondary hover:text-rk-ink"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="privacy-content"
        className="mx-auto max-w-[860px] px-5 py-10 lg:px-8 lg:py-14"
      >
        <p className="rk-label">Legal</p>
        <h1 className="mt-2 text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em] text-rk-ink sm:text-[36px]">
          Privacy Policy
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-rk-secondary">
          RENKOO is an AI Growth Operating System that helps
          businesses find what is hurting growth, understand
          why, decide what matters, execute improvements, and
          measure revenue impact. This policy explains what
          information RENKOO collects and how it is used.
        </p>
        <p className="rk-metadata mt-3">
          Last updated: [EFFECTIVE DATE] · Operated by
          [LEGAL COMPANY NAME]
        </p>

        <nav
          aria-label="Policy contents"
          className="mt-8 rounded-rk-lg border border-rk-border bg-rk-surface px-5 py-4 shadow-rk-sm"
        >
          <p className="rk-field-label">On this page</p>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="rk-focusable text-[13px] font-semibold text-rk-secondary hover:text-rk-ink"
                >
                  {s.n}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <section aria-labelledby="introduction" className="scroll-mt-24">
            <h2 id="introduction" className="rk-section-title">
              1. Introduction
            </h2>
            <p className="rk-body">
              This Privacy Policy describes how [LEGAL COMPANY
              NAME] (&ldquo;RENKOO&rdquo;, &ldquo;we&rdquo;)
              collects, uses, stores, and protects information
              when you use the RENKOO application and related
              services. By using RENKOO, you agree to the
              practices described here. This page is product
              information, not legal advice.
            </p>
          </section>

          <section
            aria-labelledby="information-collected"
            className="scroll-mt-24"
          >
            <h2 id="information-collected" className="rk-section-title">
              2. Information collected
            </h2>
            <p className="rk-body">
              RENKOO collects only the information needed to
              operate the service: account details you provide,
              website and project data you connect or enter,
              usage information generated as you work, and
              data from third-party integrations you
              explicitly authorize, such as Google services.
            </p>
          </section>

          <section aria-labelledby="account" className="scroll-mt-24">
            <h2 id="account" className="rk-section-title">
              3. Account information
            </h2>
            <p className="rk-body">
              When you register, RENKOO collects your name,
              email address, and password credentials needed to
              operate your account, workspace membership, and
              team roles. Support and billing records connected
              to your subscription are retained as part of
              account administration.
            </p>
          </section>

          <section
            aria-labelledby="website-project"
            className="scroll-mt-24"
          >
            <h2 id="website-project" className="rk-section-title">
              4. Website and project information
            </h2>
            <p className="rk-body">
              RENKOO stores the websites and business context
              you configure — such as site URLs, business
              descriptions, offerings, target audiences,
              keywords, competitors, leads, revenue records,
              content, actions, and reports — so the product
              can analyze performance, generate
              recommendations, and track outcomes. Each
              workspace&apos;s data stays inside that
              workspace.
            </p>
          </section>

          <section aria-labelledby="usage" className="scroll-mt-24">
            <h2 id="usage" className="rk-section-title">
              5. Usage and analytics information
            </h2>
            <p className="rk-body">
              RENKOO records service activity required to run
              the product, such as crawl results, analysis
              runs, AI-assisted recommendations, and
              subscription usage (for example plan limits on
              websites, keywords, crawls, or team seats). This
              information is used to operate features, enforce
              plan limits, and improve reliability.
            </p>
          </section>

          <section aria-labelledby="cookies" className="scroll-mt-24">
            <h2 id="cookies" className="rk-section-title">
              6. Cookies and local storage
            </h2>
            <p className="rk-body">
              RENKOO uses browser local storage for essential
              product state, such as your authentication
              session and the currently selected website, so
              the application remembers your workspace context
              between visits. RENKOO does not use advertising
              cookies.
            </p>
          </section>

          <section
            aria-labelledby="google-services"
            className="scroll-mt-24"
          >
            <h2 id="google-services" className="rk-section-title">
              7. Google services and data
            </h2>
            <p className="rk-body">
              RENKOO can connect to Google services only after
              you authorize access through Google&apos;s
              consent screen, and only for the product
              functionality RENKOO supports. Depending on what
              you connect, this may include Google Search
              Console data (such as queries, pages, clicks,
              impressions, click-through rate, and position),
              Google Analytics data (such as users, sessions,
              engagement, page views, and conversions), and
              read-only Google Business Profile status. RENKOO
              does not access Google data you have not
              authorized.
            </p>
          </section>

          <section aria-labelledby="google-use" className="scroll-mt-24">
            <h2 id="google-use" className="rk-section-title">
              8. How Google data is used
            </h2>
            <p className="rk-body">
              Google data is used solely to provide RENKOO
              features you request — including search and
              visibility analysis, keyword intelligence,
              reporting, and related product functionality.
              RENKOO does not use Google user data to train
              generalized machine-learning models unrelated
              to your workspace, and RENKOO does not sell
              Google user data.
            </p>
          </section>

          <section
            aria-labelledby="google-sharing"
            className="scroll-mt-24"
          >
            <h2 id="google-sharing" className="rk-section-title">
              9. Google user data sharing
            </h2>
            <p className="rk-body">
              RENKOO processes Google user data to operate the
              service within your workspace. It is not shared
              with other RENKOO customers, and cross-client
              data never leaves its workspace. Data may be
              processed by the infrastructure RENKOO runs on
              as required to provide the service, and may be
              disclosed where required by law.
            </p>
          </section>

          <section aria-labelledby="retention" className="scroll-mt-24">
            <h2 id="retention" className="rk-section-title">
              10. Data storage and retention
            </h2>
            <p className="rk-body">
              RENKOO retains information for as long as
              reasonably necessary to provide the service,
              comply with legal obligations, resolve disputes,
              and enforce agreements, subject to applicable
              law. Disconnecting an integration stops future
              collection from that source; previously imported
              data remains in your workspace until deleted.
            </p>
          </section>

          <section aria-labelledby="security" className="scroll-mt-24">
            <h2 id="security" className="rk-section-title">
              11. Security
            </h2>
            <p className="rk-body">
              RENKOO applies reasonable technical and
              organizational measures to protect information,
              including authenticated sessions, workspace
              isolation between customers, and encrypted
              transport. No method of transmission or storage
              is completely secure, and RENKOO makes no
              certification claims beyond what is stated here.
            </p>
          </section>

          <section aria-labelledby="deletion" className="scroll-mt-24">
            <h2 id="deletion" className="rk-section-title">
              12. Account deletion
            </h2>
            <p className="rk-body">
              You may request deletion of your account and
              associated workspace data by contacting [LEGAL
              CONTACT EMAIL]. RENKOO will process verified
              deletion requests subject to legal retention
              obligations.
            </p>
          </section>

          <section aria-labelledby="disconnect" className="scroll-mt-24">
            <h2 id="disconnect" className="rk-section-title">
              13. Disconnecting Google services
            </h2>
            <p className="rk-body">
              You can disconnect Google at any time from the
              Integrations page. Disconnecting revokes
              RENKOO&apos;s access so Search Console and
              Analytics data becomes unavailable in the
              product until you reconnect. Data already
              imported stays in your workspace unless you
              request its deletion.
            </p>
          </section>

          <section aria-labelledby="rights" className="scroll-mt-24">
            <h2 id="rights" className="rk-section-title">
              14. User rights
            </h2>
            <p className="rk-body">
              Depending on where you live, you may have rights
              to access, correct, export, or delete your
              personal information, and to object to certain
              processing. To exercise these rights, contact
              [LEGAL CONTACT EMAIL]. RENKOO responds to
              verified requests as required by applicable law.
            </p>
          </section>

          <section aria-labelledby="children" className="scroll-mt-24">
            <h2 id="children" className="rk-section-title">
              15. Children&apos;s privacy
            </h2>
            <p className="rk-body">
              RENKOO is a business product and is not directed
              at children. RENKOO does not knowingly collect
              personal information from children. If you
              believe a child has provided information, contact
              [LEGAL CONTACT EMAIL] so it can be removed.
            </p>
          </section>

          <section aria-labelledby="changes" className="scroll-mt-24">
            <h2 id="changes" className="rk-section-title">
              16. Changes to this policy
            </h2>
            <p className="rk-body">
              RENKOO may update this policy as the product
              evolves. Material changes will be reflected by
              the &ldquo;Last updated&rdquo; date above, and
              continued use of the service after changes take
              effect constitutes acceptance of the updated
              policy.
            </p>
          </section>

          <section aria-labelledby="contact" className="scroll-mt-24">
            <h2 id="contact" className="rk-section-title">
              17. Contact
            </h2>
            <p className="rk-body">
              For privacy questions or requests, contact
              [LEGAL CONTACT EMAIL]. Postal inquiries:
              [BUSINESS ADDRESS].
            </p>
            <p className="mt-4">
              <Link
                href="/terms"
                className="rk-focusable text-sm font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
              >
                Read the Terms of Service
              </Link>
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </>
  );
}
