import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information this Space Works Machines site collects, why, who can see it, how long it is kept and the choices you have.",
};

const sections: LegalSection[] = [
  {
    id: "who-is-responsible",
    title: "Who is responsible",
    body: [
      "Space Works Machines is open-source machine management software from Space Works that anyone can run on their own server. In this policy, the “operator” is whoever runs this Space Works Machines site, and “spaces” are the makerspaces, fab labs, college workshops and other groups that manage their machines on it. People who use a space’s machines are called “makers”.",
      "The operator is responsible for accounts, security and the running of this site. Each space is responsible for the information it uses to run its machines, such as who has joined it, the jobs makers send it, its prices and payments, and its maintenance records. Depending on where you live, the law may call the operator and the space a “controller” or a “data fiduciary” for that information.",
    ],
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: [
      "Your account. Your name, email address, password if you set one (stored only as a one-way hash), profile picture if you add one, whether you have verified your email, your two-step verification settings and the browsers you have signed in from.",
      "Spaces you join. Which spaces you belong to, your role in each (for example maker, operator or machine manager), when you joined, and whether your request to join is waiting for approval.",
      "Jobs and files. When you send a job to a space, such as a 3D print, a laser cut or a CNC job, we store the request, the design files you upload, the machine and materials it is for, its place in the queue, its status, the price and any notes between you and the space’s staff.",
      "Payments. When you pay for a job, we store the amount, what it was for, how you paid (online through the space’s own payment provider, or offline by cash, UPI or bank transfer recorded by the space’s staff) and reference numbers such as a UPI transaction reference (UTR). Card and bank details are entered with the payment provider, not on this site, and are never stored here.",
      "Machines and workshop records. For each space we store its machines, consumables, maintenance work, fault reports and usage logs, including who reported a fault or used a machine and when.",
      "Spaces and teams. For each space we store its details, the people on its staff and their roles, staff invitations including any invited email address, its connections to printers, chat services and other systems, and the platform’s review of its application.",
      "Uploads. Logos and profile pictures are checked, resized and re-encoded, and hidden metadata such as camera details and location is removed before they are stored. Job files are stored as you upload them, privately.",
      "Technical and security information. Your IP address is used briefly to limit repeated requests and prevent abuse. It is not stored in our database. We keep an activity log of important actions, such as sign-ins, approvals, role changes, job decisions, payments recorded, refunds and exports, recording who did what and when.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: [
      "We use this information to run the service: to create and secure your account, review space applications, let you join spaces, take, price, queue and run jobs, take and record payments, look after machines and consumables, send the emails and alerts you and the space need, and investigate security or technical problems.",
      "We process it because it is needed to provide the service you asked for, because the law requires it (for example, keeping payment records for tax and accounting), or because we and the space have a legitimate interest in running machines and workshops safely and accurately.",
    ],
  },
  {
    id: "who-can-see-it",
    title: "Who can see it",
    body: [
      "Spaces. A space’s staff can see what their role allows: machine managers see and manage the space, its staff and its makers; machine type managers, operators and technicians see the machines, jobs, queue and workshop records they work with; viewers can look but not change anything. Staff can export records they are allowed to see, and every export is logged.",
      "Job files. Files you upload with a job can be downloaded only by you and that space’s staff. They are never shown publicly.",
      "The public. Public space and machine pages show only what the space publishes about itself and its machines. They never show makers’ contact details or job files.",
      "Payment providers. If you pay online, the space’s own payment provider (for example Razorpay or Stripe) processes the payment under its own privacy policy and receives the details it needs to do so.",
      "Connected services. A space can send alerts to chat services such as Slack, Discord, Mattermost, Telegram or WhatsApp, connect printers, and share information with its own systems through API keys and webhooks. What is sent depends on how the space sets these up, and each of those services handles it under its own terms.",
      "The operator. The operator’s administrators can see account and space details to review applications, support spaces and protect the site. Opening a space’s records is logged.",
    ],
  },
  {
    id: "other-services",
    title: "Other services we use",
    body: [
      "Email. Emails are queued and sent through the operator’s email provider, or through a space’s own email server if it has set one up, which handles the recipient address and message to deliver them.",
      "Storage. Files may be stored with the operator’s storage provider in its configured region.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and similar technology",
    body: "We use cookies only to keep you signed in, to recognise browsers you have signed in from before, to protect forms against misuse and to remember your light or dark choice. We do not use advertising or tracking cookies.",
  },
  {
    id: "emails",
    title: "Emails we send",
    body: [
      "We send emails needed for the service: email verification, sign-in links and codes, password resets, staff invitations, application decisions, decisions on requests to join a space, and updates about your jobs and payments.",
      "Emails about your jobs and payments are part of using a space. To stop receiving them, leave the space or contact it.",
    ],
  },
  {
    id: "spaces-duties",
    title: "If you run a space",
    body: "Ask only for what you need to run your machines, explain why you are asking, get a parent’s or guardian’s consent for makers who are children, limit who on your staff can see makers’ contact details, files and payments, and set up chat alerts, webhooks and API keys so they share no more than they need to.",
  },
  {
    id: "how-long-we-keep-it",
    title: "How long we keep it",
    body: [
      "Sign-in links expire after 15 minutes and work once. Sign-in codes expire after 10 minutes. Password-reset and email-verification links expire after one hour. Unused staff invitations expire after seven days. Copies of sent emails are deleted after 30 days by default, and those containing sign-in or invitation links are deleted as soon as they are sent.",
      "Accounts, jobs, files and workshop records are kept until they are deleted by you, the space or the operator. Payment records are kept for as long as tax and accounting law requires, even if the account they belong to is deleted. In that case the name and contact details on them are removed where the law allows, and the financial record stays.",
      "Backups may hold copies of deleted information for a limited time, as set by the operator. Ask the operator about their retention schedule.",
    ],
  },
  {
    id: "security",
    title: "Security",
    body: "Passwords are hashed, payment provider keys, email server passwords and other secrets are encrypted, two-step verification with an authenticator app is available for every account and required for a space’s staff and platform administrators, sign-ins from a new browser need a code sent by email, and every important change is logged. Sign-in, invitation and password-reset links work like keys, so do not share them. No system is perfectly secure. The operator is responsible for configuring its servers, backups and access securely, and for telling people about a data breach where the law requires it.",
  },
  {
    id: "your-choices-and-rights",
    title: "Your choices and rights",
    body: [
      "From your account you can update your profile, see the spaces you belong to and leave them, manage your sign-in and two-step verification settings, and download a copy of your information from Account, then Data and privacy.",
      "Depending on where you live, including under India’s Digital Personal Data Protection Act, you may also have the right to access, correct, complete, update or erase your information, to withdraw consent as easily as you gave it, to nominate someone to act for you, to have a grievance addressed, and to complain to a data protection authority.",
      "For anything about your jobs or records at a specific space, contact that space. For your account, contact the operator. They will respond as required by the laws that apply to them. We may need to confirm who you are first.",
    ],
  },
  {
    id: "children",
    title: "Children",
    body: "If you are below the age at which you can consent to the use of your personal information where you live, a parent or guardian must give consent for you before you use this site. Spaces with makers who are children are responsible for obtaining any parental consent the law requires.",
  },
  {
    id: "international-transfers",
    title: "Where your information is stored",
    body: "Your information is stored where the operator hosts this site and its providers. If that is outside your country, the operator is responsible for protecting the transfer as the law requires.",
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to this policy",
    body: "We may update this policy when the service or the way it handles information changes. The date at the top of this page shows when it last changed. If a change is significant, the operator will tell users where the law requires it.",
  },
  {
    id: "contact",
    title: "Contact",
    body: "For questions or requests about your information, contact the operator at [operator contact email — to be filled in by the operator], or its grievance officer at [grievance officer name and contact — to be filled in by the operator]. For anything about a particular space, its machines or your jobs there, contact the space shown on its page.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      title="Privacy"
      updated="23 October 2026"
      notice="This policy describes how Space Works Machines handles personal information. Each operator must replace the bracketed placeholders with its own name and contact details, add its hosting, email, storage and payment providers, retention periods and the laws that apply to it, and should have it reviewed by a lawyer. It is not legal advice."
      sections={sections}
    />
  );
}
