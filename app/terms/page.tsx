import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for running a space and using its machines on this Space Works Machines site.",
};

const sections: LegalSection[] = [
  {
    id: "about-these-terms",
    title: "About these terms",
    body: [
      "These terms apply when you use this Space Works Machines site, whether you create an account, run a space, use a space’s machines as a maker or simply browse. By using it, you agree to them.",
      "Space Works Machines is open-source software from Space Works. This site is run by [Operator legal name — to be filled in by the operator], called the “operator”. Machines are run by makerspaces, fab labs, college workshops and other groups, called “spaces”. The operator runs the service. Each space runs its own machines.",
      "Spaces may add their own rules for their makers, such as safety rules, training requirements or a code of conduct. Those rules apply to their makers alongside these terms.",
    ],
  },
  {
    id: "who-can-use-it",
    title: "Who can use Space Works Machines",
    body: "You must be able to agree to these terms where you live. If you are under that age, a parent or guardian must agree for you, including when you join a space.",
  },
  {
    id: "your-account",
    title: "Your account",
    body: [
      "Keep your sign-in details secure, do not share sign-in links or codes, and tell the operator if you think someone else has used your account. Use your real name and an email address you control.",
      "You are responsible for what happens through your account. We recommend turning on two-step verification, and it is required for a space’s staff and for platform administrators.",
    ],
  },
  {
    id: "spaces",
    title: "Running a space",
    body: [
      "Spaces either apply and are reviewed by the operator, or are added by the operator directly. The operator may approve, ask for changes to, or decline an application, and may suspend or archive a space that breaks these terms or the law.",
      "You are responsible for your space and everything you publish or send through Space Works Machines, including machine pages, prices, decisions on jobs and requests to join, payment records, alerts and emails. Keep your details accurate and tell makers promptly if prices or rules change.",
      "You are responsible for your machines and how they are used: safety, training, supervision, maintenance and the materials you supply. Space Works Machines helps you keep track of these but does not make a machine safe to use.",
      "Machine managers decide who joins the staff and what each person can do, and are responsible for their actions. Remove access promptly when someone leaves, and look after the API keys, webhooks and connections you set up. Deleting a space permanently deletes its machines, jobs, files and staff, except records the law requires to be kept.",
    ],
  },
  {
    id: "jobs-and-payments",
    title: "Jobs and payments",
    body: [
      "When you send a job to a space, you are dealing with the space, not the operator. The space decides who may join, which jobs it accepts, its prices, its queue and its refund rules.",
      "Make sure the files you send are yours to use and safe to make. A space may decline a job it thinks is unsafe, unlawful or unsuitable for its machines.",
      "Online payments go straight to the space’s own account with its payment provider, such as Razorpay or Stripe, under that provider’s terms. The operator does not hold or handle makers’ money. Offline payments, such as cash, UPI or bank transfer, are arranged directly with the space, which records them here.",
      "Spaces are responsible for their own tax registration, the rates they charge and their filings. Space Works Machines is not tax advice.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: [
      "Do not use Space Works Machines to break the law, harass or harm others, make or send designs for weapons or other dangerous or unlawful items, publish hateful, misleading, sexually explicit or infringing content, or collect money under false pretences.",
      "Do not send spam or messages unrelated to a space, collect makers’ information for other purposes, try to access another space’s data, get around security or rate limits, upload malware, overload the service, or scrape it.",
    ],
  },
  {
    id: "your-content",
    title: "Your content",
    body: "You keep ownership of what you upload or write, including your design files. You give the operator permission to store, display and process it, and the space you send it to permission to use it to make your job, only as needed to run the service. Make sure you have the right to share it.",
  },
  {
    id: "the-service",
    title: "The service",
    body: [
      "The operator works to keep the service available and secure but may change, pause or stop parts of it, for example for maintenance or updates.",
      "Space Works Machines is open-source software licensed under the GNU Affero General Public License v3.0 or later. Its source code is available to anyone who uses it over a network.",
    ],
  },
  {
    id: "suspension-and-ending",
    title: "Suspension and ending",
    body: "You can stop using the service and ask for your account to be deleted at any time. The operator may suspend or close accounts or spaces that break these terms or the law, or that put others at risk. Records the law requires to be kept, such as payment records, are kept after closure.",
  },
  {
    id: "liability",
    title: "Disclaimers and liability",
    body: [
      "As far as the law allows, the operator gives no warranties about the service, and is not responsible for what spaces or makers do, for the machines, jobs or materials themselves, for spaces’ prices, refunds or tax treatment, or for any indirect loss. The operator’s total liability is limited as far as the law allows.",
      "Nothing in these terms limits liability that the law does not allow to be limited, or removes rights you have as a consumer.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: "The operator may update these terms when the service or the law changes. The date at the top of this page shows when they last changed. Significant changes will be announced where reasonable. If you keep using Space Works Machines after a change takes effect, you accept the updated terms.",
  },
  {
    id: "law-and-contact",
    title: "Governing law and contact",
    body: "These terms are governed by the laws of [governing law and jurisdiction — to be filled in by the operator], unless the law where you live gives you other rights. For questions about these terms, your account or the privacy policy, contact the operator at [operator contact email — to be filled in by the operator]. For questions about a particular space, its machines or your jobs there, contact the space.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="terms"
      title="Terms of use"
      updated="23 October 2026"
      notice="These terms are a starting point for any Space Works Machines site. Each operator must replace the bracketed placeholders with its legal name, contact details and governing law, add how disputes are handled, and should have them reviewed by a lawyer. They are not legal advice."
      sections={sections}
    />
  );
}
