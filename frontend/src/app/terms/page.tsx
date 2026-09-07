import Link from 'next/link';
import type { Metadata } from 'next';
import PublicFooter from '../../components/PublicFooter';

/*
 * RENKOO — Terms of Service (public, no authentication required).
 * Product content preparation, not legal advice. Company and
 * legal details that are not defined in the project use clearly
 * marked editable placeholders — no facts invented, no prices,
 * refund terms, or compliance claims added.
 */

export const metadata: Metadata = {
  title: 'RENKOO Terms of Service',
  description:
    'The terms governing use of RENKOO accounts, workspaces, integrations, subscriptions and AI-assisted recommendations.',
};

const SECTIONS = [
  { id: 'acceptance', n: '1', title: 'Acceptance of Terms' },
  { id: 'service', n: '2', title: 'Service description' },
  { id: 'registration', n: '3', title: 'Account registration' },
  { id: 'responsibilities', n: '4', title: 'User responsibilities' },
  { id: 'acceptable-use', n: '5', title: 'Acceptable use' },
  { id: 'project-data', n: '6', title: 'Website and project data' },
  { id: 'third-party', n: '7', title: 'Third-party integrations' },
  { id: 'google', n: '8', title: 'Google integrations' },
  { id: 'ai', n: '9', title: 'AI-generated information' },
  { id: 'billing', n: '10', title: 'Subscriptions and billing' },
  { id: 'trials', n: '11', title: 'Trials' },
  { id: 'ip', n: '12', title: 'Intellectual property' },
  { id: 'content', n: '13', title: 'User content and data' },
  { id: 'availability', n: '14', title: 'Service availability' },
  { id: 'disclaimer', n: '15', title: 'Disclaimer' },
  { id: 'liability', n: '16', title: 'Limitation of liability' },
  { id: 'termination', n: '17', title: 'Termination' },
  { id: 'changes', n: '18', title: 'Changes to these Terms' },
  { id: 'law', n: '19', title: 'Governing law and contact' },
];

export default function TermsPage() {
  return (
    <>
      <a
        href="#terms-content"
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
        id="terms-content"
        className="mx-auto max-w-[860px] px-5 py-10 lg:px-8 lg:py-14"
      >
        <p className="rk-label">Legal</p>
        <h1 className="mt-2 text-[30px] font-extrabold leading-[1.15] tracking-[-0.03em] text-rk-ink sm:text-[36px]">
          Terms of Service
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-rk-secondary">
          These terms govern your use of RENKOO, the AI Growth
          Operating System. Please read them carefully. This
          page is product information, not legal advice, and
          these terms have not necessarily been reviewed by a
          lawyer.
        </p>
        <p className="rk-metadata mt-3">
          Last updated: September 7, 2026 · Operated by
          Harsh Sharad Patil
        </p>

        <nav
          aria-label="Terms contents"
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
          <section aria-labelledby="acceptance" className="scroll-mt-24">
            <h2 id="acceptance" className="rk-section-title">
              1. Acceptance of Terms
            </h2>
            <p className="rk-body">
              By creating an account or using RENKOO, you agree
              to these Terms of Service and to the Privacy
              Policy. If you use RENKOO on behalf of a
              business, you confirm you are authorized to bind
              that business to these terms.
            </p>
          </section>

          <section aria-labelledby="service" className="scroll-mt-24">
            <h2 id="service" className="rk-section-title">
              2. Service description
            </h2>
            <p className="rk-body">
              RENKOO provides search, content, visibility,
              lead, revenue, and reporting functionality —
              including technical SEO analysis, search and AI
              visibility tracking, keyword intelligence,
              competitor and backlink analysis, content
              workflows, opportunity prioritization, action
              tracking, and outcome measurement — based on
              data you provide or connect.
            </p>
          </section>

          <section
            aria-labelledby="registration"
            className="scroll-mt-24"
          >
            <h2 id="registration" className="rk-section-title">
              3. Account registration
            </h2>
            <p className="rk-body">
              You must provide accurate registration
              information and keep your credentials
              confidential. You are responsible for activity
              under your account, including actions taken by
              team members you invite to your workspace.
            </p>
          </section>

          <section
            aria-labelledby="responsibilities"
            className="scroll-mt-24"
          >
            <h2 id="responsibilities" className="rk-section-title">
              4. User responsibilities
            </h2>
            <p className="rk-body">
              You are responsible for the websites, business
              information, and content you add to RENKOO, for
              maintaining appropriate rights to that material,
              and for reviewing AI-assisted recommendations
              before acting on them. Publishing decisions and
              their consequences remain yours.
            </p>
          </section>

          <section
            aria-labelledby="acceptable-use"
            className="scroll-mt-24"
          >
            <h2 id="acceptable-use" className="rk-section-title">
              5. Acceptable use
            </h2>
            <p className="rk-body">
              You agree not to misuse RENKOO — including
              attempting to access other customers&apos;
              workspaces, interfering with the service,
              submitting unlawful content, or using the
              service in ways that violate applicable law or
              third-party terms (including the terms of any
              connected platform).
            </p>
          </section>

          <section
            aria-labelledby="project-data"
            className="scroll-mt-24"
          >
            <h2 id="project-data" className="rk-section-title">
              6. Website and project data
            </h2>
            <p className="rk-body">
              Data you add or connect — websites, business
              context, keywords, leads, revenue, content, and
              reports — remains yours. You grant RENKOO the
              limited right to process it as needed to provide
              the service. Each workspace&apos;s data stays
              inside that workspace.
            </p>
          </section>

          <section
            aria-labelledby="third-party"
            className="scroll-mt-24"
          >
            <h2 id="third-party" className="rk-section-title">
              7. Third-party integrations
            </h2>
            <p className="rk-body">
              RENKOO can connect to third-party platforms you
              authorize. Those platforms operate under their
              own terms and availability; RENKOO is not
              responsible for changes, interruptions, or data
              practices on the third party&apos;s side.
            </p>
          </section>

          <section aria-labelledby="google" className="scroll-mt-24">
            <h2 id="google" className="rk-section-title">
              8. Google integrations
            </h2>
            <p className="rk-body">
              Where you connect Google services, RENKOO
              accesses Google data — such as Search Console
              performance or Analytics traffic — only after
              your authorization and only to power RENKOO
              features like search analysis and reporting. You
              can disconnect at any time from the Integrations
              page, after which connected data becomes
              unavailable in the product until you reconnect.
            </p>
          </section>

          <section aria-labelledby="ai" className="scroll-mt-24">
            <h2 id="ai" className="rk-section-title">
              9. AI-generated information
            </h2>
            <p className="rk-body">
              RENKOO provides AI-assisted analysis,
              recommendations, briefs, and drafts to support
              your judgment — not as guaranteed business
              results. Outputs may be incomplete or incorrect;
              verify important information independently
              before relying on it.
            </p>
          </section>

          <section aria-labelledby="billing" className="scroll-mt-24">
            <h2 id="billing" className="rk-section-title">
              10. Subscriptions and billing
            </h2>
            <p className="rk-body">
              Paid plans are billed through the checkout
              presented in the Billing section of the product.
              Plan limits (such as websites, keywords, crawls,
              or team seats) apply as shown in the product.
              Taxes, invoices, and receipts are handled
              through the billing provider at checkout.
            </p>
          </section>

          <section aria-labelledby="trials" className="scroll-mt-24">
            <h2 id="trials" className="rk-section-title">
              11. Trials
            </h2>
            <p className="rk-body">
              Where the product offers a trial, trial access
              follows the scope and duration shown in the
              product. Trial terms are as displayed at the
              time of activation.
            </p>
          </section>

          <section aria-labelledby="ip" className="scroll-mt-24">
            <h2 id="ip" className="rk-section-title">
              12. Intellectual property
            </h2>
            <p className="rk-body">
              RENKOO, its interface, and its underlying
              software remain the property of RENKOO
              (operated by Harsh Sharad Patil) and its
              licensors. These terms do not
              grant you ownership of the service — only the
              limited right to use it as described here.
            </p>
          </section>

          <section aria-labelledby="content" className="scroll-mt-24">
            <h2 id="content" className="rk-section-title">
              13. User content and data
            </h2>
            <p className="rk-body">
              You retain ownership of content and data you
              submit. You are responsible for backing up
              material that matters to you, and for ensuring
              you have the rights needed to submit and process
              it through RENKOO.
            </p>
          </section>

          <section
            aria-labelledby="availability"
            className="scroll-mt-24"
          >
            <h2 id="availability" className="rk-section-title">
              14. Service availability
            </h2>
            <p className="rk-body">
              RENKOO aims for reliable availability but does
              not guarantee uninterrupted service. Features
              may change as the product evolves, and
              functionality that depends on third-party
              platforms may be affected by those
              platforms&apos; availability.
            </p>
          </section>

          <section aria-labelledby="disclaimer" className="scroll-mt-24">
            <h2 id="disclaimer" className="rk-section-title">
              15. Disclaimer
            </h2>
            <p className="rk-body">
              RENKOO is provided &ldquo;as is&rdquo; without
              warranties of any kind, whether express or
              implied, to the maximum extent permitted by
              applicable law.
            </p>
          </section>

          <section aria-labelledby="liability" className="scroll-mt-24">
            <h2 id="liability" className="rk-section-title">
              16. Limitation of liability
            </h2>
            <p className="rk-body">
              To the maximum extent permitted by applicable
              law, the operator of RENKOO (Harsh Sharad Patil)
              is not liable for
              indirect, incidental, or consequential damages
              arising from your use of RENKOO. Specific
              liability terms, if any, are as agreed in a
              separate written agreement.
            </p>
          </section>

          <section
            aria-labelledby="termination"
            className="scroll-mt-24"
          >
            <h2 id="termination" className="rk-section-title">
              17. Termination
            </h2>
            <p className="rk-body">
              You may stop using RENKOO at any time. RENKOO
              may suspend or terminate accounts that violate
              these terms or applicable law. On termination,
              your right to use the service ends; data
              handling follows the Privacy Policy.
            </p>
          </section>

          <section aria-labelledby="changes" className="scroll-mt-24">
            <h2 id="changes" className="rk-section-title">
              18. Changes to these Terms
            </h2>
            <p className="rk-body">
              RENKOO may update these terms as the product
              evolves. Material changes will be reflected by
              the &ldquo;Last updated&rdquo; date above, and
              continued use after changes take effect
              constitutes acceptance.
            </p>
          </section>

          <section aria-labelledby="law" className="scroll-mt-24">
            <h2 id="law" className="rk-section-title">
              19. Governing law and contact
            </h2>
            <p className="rk-body">
              These terms are governed by the laws of
              Maharashtra, India. Questions about these
              terms: harshpatil53342@gmail.com.
            </p>
            <p className="mt-4">
              <Link
                href="/privacy"
                className="rk-focusable text-sm font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
              >
                Read the Privacy Policy
              </Link>
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </>
  );
}
