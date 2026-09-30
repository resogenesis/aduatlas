// Vercel-style serverless function: sends transactional email via Resend.
//
// Required env:
//   RESEND_API_KEY
//   RESEND_FROM                 (e.g. hello@aduatlas.com — verified in Resend)
//   OPS_EMAIL                   (where an operations template lands, e.g.
//                                hello@aduatlas.com — a FIXED address, never
//                                one a caller supplies. Falls back to
//                                RESEND_FROM when unset.)
//   SUPABASE_URL                (to verify the caller's access token and, for
//   SUPABASE_SERVICE_ROLE_KEY    the lead template, to confirm the recipient is
//                                an address ADUAtlas itself captured)
//   STRIPE_SECRET_KEY           (to verify a paid Checkout Session)
//   APP_BASE_URL                (e.g. https://aduatlas.com — every link is
//                                built from this, never from the request body)
//
// Body shape (POST JSON):
//   { template: "complete-plan" | "welcome" | "refund-requested"
//              | "refund-request-ops" | "intro-request-ops" | "magic-link"
//              | "builder-invitation" | "intro-forward" | "message-waiting",
//     to: string,            // honoured for "complete-plan" only, and then only
//                            // for an address ADUAtlas itself just captured;
//                            // every other template sends to the address it
//                            // verified, to the fixed operations address, or to
//                            // the address on the record an admin named
//     sessionId?: string,    // Stripe Checkout Session, proof for "welcome"
//     builderId?: string,    // a public.builders row: the recipient of
//                            // "builder-invitation", resolved server-side
//     introId?: string,      // a public.intro_requests row: the recipient of
//                            // "intro-forward", resolved server-side
//     conversationId?: string, // a public.builder_conversations row, for
//                            // "message-waiting" (also read from data, since
//                            // src/lib/email.js sends only template, to, data)
//     data: object }         // IGNORED in "admin" and "participant" mode. Those
//                            // templates take every word they send from the
//                            // record, so a caller cannot put a claim code, a
//                            // homeowner's address, a message or anything else
//                            // into that mail.
//
// WHO MAY MAKE ADUAtlas SEND MAIL (this endpoint had no authentication, no
// session check and no origin check, so any caller could make ADUAtlas send mail
// to any address):
//   "self"  the caller proves identity with their Supabase access token,
//           verified exactly the way api/_admin.js verifies a Bearer token, and
//           the mail goes to that account's own address. `to` is ignored.
//   "buyer" a PAID Stripe Checkout Session, or a verified access token. The
//           recipient is the address Stripe billed (or the token's own address),
//           never one the caller supplies. The Stripe proof exists because
//           payment precedes account creation, so the buyer who most needs the
//           welcome mail has no session yet.
//   "ops"   the caller proves identity with their Supabase access token, and the
//           mail goes to the FIXED operations address in OPS_EMAIL. `to` is
//           ignored. This is the one direction that reaches a human at ADUAtlas
//           rather than the customer, and it exists because the refund promise
//           on /settings has to land in somebody's inbox. The customer-facing
//           record stays the support_messages row /settings writes first.
//   "admin" the caller proves they are an ADMIN: the Supabase access token is
//           verified exactly the way api/_admin.js verifies one, and then
//           users.role is read FROM THE DATABASE. No header and no body field
//           has a say in it. These templates reach an address the caller does
//           not own, so the recipient is resolved SERVER-SIDE from a record id
//           in the body (builderId or introId) and `to` is ignored, as it is
//           for buyer, self and ops. See ADMIN MODE below.
//   "lead"  the email gate on /unlock, where by definition no account exists
//           yet. There is no identity to verify, so this path is fenced in
//           instead. See LEAD MODE below.
//   "participant" the caller proves identity with their Supabase access token,
//           verified exactly the way api/_admin.js verifies one, and must be a
//           PARTICIPANT of the conversation the body names: its homeowner, or
//           the account that owns its builder listing. The mail goes to the
//           OTHER participant, resolved server-side from the record. See
//           PARTICIPANT MODE below.
//
// PARTICIPANT MODE, decision 2h. The ADUAtlas thread is the system of record and
// email only tells a participant that a new message is waiting. So
// "message-waiting" carries NO message text and nothing that identifies the
// homeowner: it says a message is waiting and links to the page it is on
// (/messages for a homeowner, /builder/messages for a builder). The resolver
// never selects a message body. The recipient is the homeowner's account email
// or the email of the account that owns the builder listing; a listing with no
// owner (unclaimed, or released by an admin) has nobody to tell, and nothing is
// sent. The answer is only { sent, reason }, never an address and never whether
// one exists beyond that reason code. builder_messages.notified_at (0011) is
// stamped on the caller's unnotified messages in that thread ONLY after Resend
// accepts the send. Nobody is mailed twice about the same waiting messages:
//   - while an earlier mail from this side is still OUTSTANDING (sent inside the
//     quiet window and its message not yet read), a new message is not mailed
//     again, because that mail already says a message is waiting. Once the
//     recipient reads, the next message is announced straight away;
//   - every send carries a Resend Idempotency-Key built from the OLDEST waiting
//     message, so requests for the same waiting messages that land on
//     different serverless instances at the same moment collapse into one
//     delivery at Resend. The in-memory limiter below is per instance and could
//     not hold that on its own.
// Without RESEND_API_KEY the answer is { sent: false, reason: "not-configured" }
// and nothing is stamped. The client fires this after a message row is written
// and never waits on it, so a message is complete whether or not any email goes
// out.
//
// LEAD MODE, and why an Origin check was not enough. "complete-plan" is the one
// template whose recipient comes from the request, so it was the one way
// ADUAtlas could be turned into an open relay. The old fence was an Origin
// header check, and a non-browser client sets Origin to whatever it likes, so
// that fence was decorative. Three things hold it now:
//   1. The recipient must already exist as a row in `leads`. ADUAtlas will only
//      mail an address its own email gate captured.
//   2. That lead must have been captured within LEAD_WINDOW_MS. leads.created_at
//      is written once and is NOT touched by capture_lead's ON CONFLICT branch
//      (0005/0007), so the window for any given address opens once and then
//      closes permanently. The endpoint therefore cannot be aimed at the same
//      address twice, which is what an open relay or a mail-bomb needs.
//   3. The body is fixed copy from src/lib/plans.js and the only link is clamped
//      to our own origin, so even a permitted send cannot carry a caller's words
//      or a caller's URL.
// The Origin check stays as a cheap first filter. It is not the boundary; 1 and
// 2 are. Lead mode fails CLOSED when Supabase is not configured, because without
// it rule 1 cannot be checked at all.
//
// ADMIN MODE, and why the body names a RECORD rather than an address. The two
// admin templates are the only mail ADUAtlas sends to a third party: a builder
// ADUAtlas listed from public information, who never handed us an address
// through the product. Honouring `to` here would reopen the open relay this
// file exists to close, so the body names a record and the server reads the
// address off it with the service client. An admin chooses which builder to
// write to; nobody chooses where the mail goes. A record with no contact email
// is a refusal with a reason, not a quiet 200, because an admin told "sent"
// when nothing was sent is worse than an error: the whole point of the
// invitation is that somebody was actually told.
//
// PRIVACY, decision 8, and this is load-bearing. The homeowner initiates every
// conversation and their contact details reach a builder only if the homeowner
// volunteers them. So "intro-forward" carries the homeowner's MESSAGE and
// nothing that identifies them. The resolver does not even SELECT the
// homeowner's row: there is no name and no address in scope, so none can reach
// the body by a later edit's accident. Decision 2h makes the ADUAtlas record
// the system of record and email only the notification. An introduction is not
// a conversation (it can reach an unclaimed listing, which has no portal), so
// its copy says ADUAtlas relays the reply rather than pointing at a portal.
//
// WORDING, section 5.2 and decision 2a. An invitation may say that claiming
// increases a company's visibility to homeowners looking for ADU builders. It
// may never say ADUAtlas will generate traffic, and it may promise no number of
// introductions, leads or projects. An unclaimed listing is a listing ADUAtlas
// compiled from public information: it must never read as participation,
// partnership or endorsement, and it never carries "here is your link", because
// the referral link comes with the claim. Nor may it claim ADUAtlas records
// nothing before a claim (2c), which is why the invitation says plainly what is
// measured against an unclaimed listing.
//
// Copy rule: the offer lives in src/lib/plans.js. Package names and prices are
// read from there so an email can never contradict the pricing page.

import { Resend } from "resend";
import Stripe from "stripe";
import { readBody, service } from "./_admin.js";
import { PLAN_IDS, formatPrice, planById, planRank } from "../src/lib/plans.js";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (raw) => {
  const e = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return e.length <= 254 && EMAIL_RE.test(e) ? e : "";
};

const fromAddress = () => process.env.RESEND_FROM || "hello@aduatlas.com";

// Where an "ops" template lands. A fixed environment address, validated for
// shape so a typo fails loudly instead of sending nowhere. Never the body.
const opsAddress = () => normalizeEmail(process.env.OPS_EMAIL) || normalizeEmail(fromAddress());

// Everything interpolated into an email body is escaped. Only a caller's own
// note and our own URLs reach the templates, but an unescaped body is how a
// benign field becomes markup in someone's inbox.
const esc = (v) =>
  String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Our own origin. APP_BASE_URL first; the Host header is a fallback only, and
// only when it looks like a hostname, because the client controls it.
const appBase = (req) => {
  const configured = (process.env.APP_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = String(req?.headers?.host || "");
  if (/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) return `https://${host}`;
  return "https://aduatlas.com";
};

// A link in a "lead" email may only point at ADUAtlas, so an unauthenticated
// caller cannot have us send an ADUAtlas-branded email carrying their link.
const ownUrl = (base, raw, fallbackPath) => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === base || s.startsWith(`${base}/`)) return s;
  return `${base}${fallbackPath}`;
};

// ── Templates ────────────────────────────────────────────────────────────────
// What each package buys, in the locked words. Platinum builds on Golden and
// Concierge on Platinum, so the lists cannot drift apart. The site plan is one
// service in two versions, never two documents; there is no property-review
// line; Concierge advertises no message count.
//
// The Golden line used to promise "state and city learning resources". ADUAtlas
// has no resource pages and no per-state or per-city library: what the course
// actually does is teach a homeowner how to look up and verify the rules their own
// state and city apply, which is Module 2. The line says that, in the same words
// the pricing page and the paywall use. Nothing here may describe a surface the
// portal does not have.
const GOLDEN_INCLUDES = [
  "The complete ADUAtlas course, including how to look up and verify your own state and city rules",
  "Access to the ADUAtlas builder directory",
];
const PLATINUM_INCLUDES = [
  ...GOLDEN_INCLUDES,
  "The preparation worksheets and your ADU Ready Score",
  "A feasibility study for your property",
  "Your site plan in two versions: what could fit, and the arrangement you want",
  "Recommended next steps",
];
const CONCIERGE_INCLUDES = [
  ...PLATINUM_INCLUDES,
  "60 minutes of live consultation, as one session or two",
  "Written support through the ADUAtlas portal",
];
const INCLUDES = {
  [PLAN_IDS.GOLDEN]: GOLDEN_INCLUDES,
  [PLAN_IDS.PLATINUM]: PLATINUM_INCLUDES,
  [PLAN_IDS.CONCIERGE]: CONCIERGE_INCLUDES,
};

const list = (lines) => `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;

const TEMPLATES = {
  // Lead nurture after the email gate on /unlock. No account exists yet, so
  // this is the one template sent to an address the caller supplies, and the
  // only thing it can say is what is on the pricing page.
  "complete-plan": ({ base, data }) => {
    const url = ownUrl(base, data.url, "/unlock");
    const golden = planById(PLAN_IDS.GOLDEN);
    const platinum = planById(PLAN_IDS.PLATINUM);
    const concierge = planById(PLAN_IDS.CONCIERGE);
    return {
      subject: "Your ADU plan is waiting on ADUAtlas",
      html: `
      <p>You saved your email on ADUAtlas. Pick up where you left off:</p>
      <p><a href="${esc(url)}">Choose your package</a></p>
      <p><strong>${esc(golden.name)}, ${esc(formatPrice(golden.priceCents))}.</strong> The complete ADUAtlas course, including how to look up and verify your own state and city rules, plus access to the builder directory.</p>
      <p><strong>${esc(platinum.name)}, ${esc(formatPrice(platinum.priceCents))}.</strong> Everything in ${esc(golden.name)}, plus the preparation worksheets and your ADU Ready Score, a feasibility study for your property, and your site plan in two versions: what could fit, and the arrangement you want.</p>
      <p><strong>${esc(concierge.name)}, ${esc(formatPrice(concierge.priceCents))}.</strong> Everything in ${esc(platinum.name)}, plus 60 minutes of live consultation and written support through the ADUAtlas portal.</p>
      <p>Every package includes a 48 hour full refund.</p>
    `,
    };
  },

  // Post-purchase. The tier is whatever the purchase says it is, never what the
  // browser claims, and the next step is step 4 of the locked flow: create the
  // account the purchase attaches to.
  //
  // This is sent by api/stripe-webhook.js on checkout.session.completed, from the
  // server, once per Stripe event. It used to be fired from the browser on the
  // /welcome screen, so a buyer who closed that tab had paid between $79 and $500
  // and was never told to create an account.
  "welcome": ({ base, tier }) => {
    const plan = planById(tier);
    const lines = plan ? INCLUDES[plan.id] || [] : [];
    const hasProperty = plan ? planRank(plan.id) >= planRank(PLAN_IDS.PLATINUM) : false;
    return {
      subject: plan ? `Your ADUAtlas ${plan.name} package is confirmed` : "Your ADUAtlas purchase is confirmed",
      html: `
      <p>Thank you. Your payment is confirmed${plan ? ` for the ADUAtlas ${esc(plan.name)} package, ${esc(formatPrice(plan.priceCents))}` : ""}.</p>
      <p>One step left. Create your account with this email address and everything you bought opens in your portal:</p>
      <p><a href="${esc(base)}/create-account">${esc(base)}/create-account</a></p>
      ${lines.length ? `<p>What ${esc(plan.name)} includes:</p>${list(lines)}` : ""}
      ${hasProperty ? "<p>ADUAtlas prepares your feasibility study and your site plan after you submit your property details in the portal. Both versions of the site plan arrive together: what could fit, and the arrangement you want.</p>" : ""}
      <p>48 hour full refund. If ADUAtlas is not useful within 48 hours of purchase, reply to this email and we refund in full.</p>
    `,
    };
  },

  // The customer's own copy of their refund request. It says where the answer
  // will be, because a refunded customer holds no plan and signs in to /unlock,
  // so nothing else points them back to it. The reply is written into the
  // refund thread (support_messages, kind 'refund_request', contract C1), and
  // /settings shows that thread whatever the account holds now. /settings is
  // SignedInOnly, so a signed-out reader who follows the link signs in and is
  // returned there by ?next=.
  "refund-requested": ({ base, data }) => ({
    subject: "Refund request received",
    html: `
      <p>We have received your refund request and someone from our team will respond within one business day.</p>
      <p>Our reply will appear on your account page on ADUAtlas, under Your refund request. Sign in to read it there:</p>
      <p><a href="${esc(base)}/settings">${esc(base)}/settings</a></p>
      <p>Every package carries a 48 hour full refund, no questions asked.</p>
      <p>If you can share what did not work for you, with no obligation, it helps us fix it for the next homeowner.</p>
      ${data.note ? `<p>Your note: ${esc(String(data.note).slice(0, 2000))}</p>` : ""}
    `,
  }),

  // The ONE operations template. The recipient is OPS_EMAIL, resolved from the
  // environment and never from the request, so this cannot be pointed at a third
  // party. `caller` is the address on the verified access token, so the human
  // reading it knows who asked without trusting anything in the body. The
  // support_messages row of kind 'refund_request' that /settings files first is
  // the record (contract C1); this is the nudge.
  "refund-request-ops": ({ base, tier, data, caller }) => {
    const plan = planById(tier);
    return {
      subject: `Refund request: ${caller || "ADUAtlas customer"}`,
      html: `
      <p>A customer has requested a refund under the 48 hour policy.</p>
      <p><strong>Account:</strong> ${esc(caller || "not recorded")}</p>
      <p><strong>Plan on record:</strong> ${plan ? `${esc(plan.name)}, ${esc(formatPrice(plan.priceCents))}` : "none recorded"}</p>
      ${data.note ? `<p><strong>What they wrote:</strong> ${esc(String(data.note).slice(0, 2000))}</p>` : ""}
      <p>The request is already filed in the ADUAtlas console as a refund request, in its own thread under Studies, Support. That thread is the record of it. Answer the customer there: they read the reply on their Settings page. This email is only the nudge.</p>
      <p><a href="${esc(base)}/admin/studies">Open the support queue</a></p>
    `,
    };
  },

  // Unused at the time of writing: nothing in the app sends it. It is kept
  // because a signed-in "email me a sign-in link" flow is the one shape this
  // template is correct for, its recipient being bound to the verified caller.
  // LOGGED-OUT password recovery cannot use it (there is no token to verify, and
  // an unauthenticated template that mails an arbitrary address is the open relay
  // this file exists to close); that flow belongs to Supabase's own
  // resetPasswordForEmail, which verifies the address and rate limits itself.
  "magic-link": ({ data }) => {
    const raw = typeof data.link === "string" ? data.link.trim() : "";
    const link = /^https?:\/\//i.test(raw) ? raw : "";
    return {
      subject: "Your sign-in link",
      html: link
        ? `
      <p>Click to sign in to ADUAtlas:</p>
      <p><a href="${esc(link)}">${esc(link)}</a></p>
      <p>This link expires in 15 minutes.</p>
    `
        : `
      <p>We could not build your sign-in link. Please request a new one from the ADUAtlas login page.</p>
    `,
    };
  },

  // ── Builder outreach (section 5.2) ─────────────────────────────────────────
  // The invitation. ADUAtlas seeds a state's directory from public information,
  // and until this existed there was no way to tell a listed company that its
  // listing was there: the claim, verify, track and $500 lifecycle had no entry
  // point at all.
  //
  // The copy is bounded, in this order, by 2a, 2c, 5.2 and 5.5:
  //   • It opens by saying ADUAtlas compiled the listing from public
  //     information and that nobody at the company has signed up for anything,
  //     because an unclaimed listing must imply no participation (2a).
  //   • It says claiming lets them correct the listing and increases their
  //     visibility to homeowners looking for ADU builders. It never says
  //     ADUAtlas will generate traffic and it promises no number of
  //     introductions, leads or projects (5.2).
  //   • It says what IS measured against an unclaimed listing, because builder
  //     facing copy may never claim ADUAtlas records nothing before a claim
  //     (2c), and that claiming is what gives them access to those numbers.
  //   • The terms are 5.5's, in the words /for-builders already uses so an
  //     email cannot contradict the page: 90 free days from the CLAIM, $49 a
  //     month after that, $0 for a view, a click, an inquiry or a qualified
  //     lead at any time, and $500 only when an ADUAtlas-referred homeowner
  //     SIGNS a project.
  //   • Messaging is described as it works under 2h, which put it in Phase 1
  //     after 5.5 was written: a homeowner starts the conversation from a
  //     CLAIMED profile and the builder replies in the builder portal. A
  //     builder can never open one, so the mail never implies that claiming
  //     gives a way to start a conversation with a homeowner.
  //   • The badge is named exactly, "Verified on ADUAtlas", and immediately
  //     told what it means: profile claimed and business information checked.
  //     Nothing here may read as ADUAtlas judging the work (2e).
  //
  // The claim code is the one secret in this file's outgoing mail. The handler
  // reads it off the builders row; it can never arrive in a request. The
  // referral link is deliberately absent: 5.2 forbids sending an unclaimed
  // builder "here is your link", because the link comes with the claim.
  "builder-invitation": ({ base, data }) => {
    const name = String(data.name || "").slice(0, 200);
    const code = String(data.claimCode || "").slice(0, 32);
    // The slug only becomes a link when it looks like one. Rows written through
    // the admin route are slugified to [a-z0-9-], but a seed script writes this
    // column too, and a link is not worth guessing at in outgoing mail: an odd
    // slug drops the line rather than mailing a broken URL.
    const rawSlug = String(data.slug || "").slice(0, 200);
    const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug) ? rawSlug : "";
    const company = name || "your company";
    return {
      subject: name ? `Claim your ADUAtlas listing for ${name}` : "Claim your ADUAtlas listing",
      html: `
      <p>ADUAtlas is a homeowner platform for people working out whether they can build an ADU and who could build it for them. We are building the ADU builder directory state by state from public information, and we have compiled a listing for ${esc(company)}. Nobody at your company has signed up for anything, and the listing does not say that you work with us.</p>
      <p>You can claim it. Claiming lets you correct anything we got wrong, complete the profile in your own words, and increase your visibility to homeowners looking for ADU builders in the areas you serve.</p>
      ${slug ? `<p>The listing as it stands today: <a href="${esc(base)}/builders/${esc(slug)}">${esc(base)}/builders/${esc(slug)}</a></p>` : ""}
      <p><strong>Your claim code is ${esc(code)}.</strong> Create your builder account and enter the code in your portal:</p>
      <p><a href="${esc(base)}/builders/join">${esc(base)}/builders/join</a></p>
      <p>What claiming switches on: the complete profile, your own dashboard with the profile views and introduction requests your listing has collected, an ADUAtlas referral link, a Messages page in your builder portal, where a homeowner on an ADUAtlas plan can choose to write to you and you can answer (we do not promise that anyone will), and the "Verified on ADUAtlas" badge once we have checked your business information. That badge means exactly that, profile claimed and business information verified by ADUAtlas, and nothing about your workmanship, your licensing beyond what we checked, or how your projects turn out.</p>
      <p>What an unclaimed listing has none of: a referral or tracking link, a dashboard, access to any of the numbers we collect, the badge, or a Messages page where a homeowner can write to you directly on ADUAtlas. ADUAtlas can still forward an introduction a homeowner asks for to the contact address on your listing, claimed or not.</p>
      <p>Be clear about what we do record. For every listing we publish, claimed or not, ADUAtlas measures its own marketplace: when a signed-in homeowner opens the profile, and when a homeowner asks us for an introduction. Being listed does not put your company into a referral program, and claiming is what gives you access to those numbers.</p>
      <p>The terms. Your first 90 days after you claim are free. After that, marketplace membership is $49 a month. There is no charge for a profile view, a link click, an inquiry or a qualified homeowner lead, at any time. If an ADUAtlas-referred homeowner signs an ADU project with your company, our standard referral fee is $500, in the first 90 days and after. We promise you no number of introductions, leads or projects.</p>
      <p>If your company already runs an affiliate or referral program, we are happy to work with your existing tracking link and terms instead.</p>
      <p>If anything in the listing is wrong, or you would rather your company were not listed, reply to this email and tell us.</p>
    `,
    };
  },

  // A homeowner asked ADUAtlas for an introduction, and this is how the builder
  // hears about it. Before this, requestIntro() wrote a row and the homeowner
  // read "Introduction requested" forever while the builder was never told.
  //
  // DECISION 8 IS THE SHAPE OF THIS TEMPLATE. The homeowner starts every
  // conversation and their contact details reach a builder only if they
  // volunteer them, so what travels is the message they wrote and nothing else:
  // no name, no email address, no phone number. The resolver never selects the
  // homeowner's row, so there is nothing of theirs here to leak.
  //
  // It promises no portal reply, because an introduction is not a 2h
  // conversation and may go to a listing nobody has claimed, which has no
  // portal. The From address is ADUAtlas, so "reply and we pass it on" is a
  // thing ADUAtlas can actually do, and 2h keeps the ADUAtlas record as the
  // system of record with email as the notification either way.
  "intro-forward": ({ data }) => {
    const builderName = String(data.builderName || "").slice(0, 200);
    const message = String(data.message || "").slice(0, 2000).trim();
    return {
      subject: "A homeowner on ADUAtlas asked for an introduction",
      html: `
      <p>A homeowner using ADUAtlas asked us to introduce them to ${esc(builderName || "your company")}.</p>
      ${message ? `<p>This is what they wrote:</p><p>${esc(message)}</p>` : "<p>They did not add a message.</p>"}
      <p>We have not sent you their name, email address or phone number. On ADUAtlas the homeowner starts the conversation, and their contact details reach a builder only if they choose to share them.</p>
      <p>Reply to this email and ADUAtlas passes your answer back to the homeowner. The request itself is recorded in ADUAtlas, which is the record of it; this email is how you hear about it.</p>
      <p>There is no charge for an introduction.</p>
    `,
    };
  },

  // The operations nudge for a new introduction, so one does not sit unseen in
  // the console. Fixed OPS_EMAIL recipient, like every "ops" template.
  //
  // Nothing identifying the homeowner is in here, on purpose. Operations acts on
  // this by opening the introductions queue, which has the homeowner, the
  // message and the builder's contact details; the id is all this mail needs to
  // carry to get somebody to the right row. The values come from the caller's
  // body, so they are escaped and capped, and the row in the console is the
  // authority on both.
  "intro-request-ops": ({ base, data }) => {
    const builderName = String(data.builderName || "").slice(0, 200);
    const introId = String(data.introId || "").slice(0, 100);
    return {
      subject: `New introduction request: ${builderName || "builder"}`,
      html: `
      <p>A homeowner has asked ADUAtlas for an introduction to ${esc(builderName || "a builder")}.</p>
      <p><strong>Introduction:</strong> ${esc(introId || "not recorded")}</p>
      <p>Nothing identifying the homeowner is in this email. The console has who asked and what they wrote.</p>
      <p><a href="${esc(base)}/admin/builders">Open the introductions queue</a></p>
      <p>The introduction is already filed in the ADUAtlas console, which is the record of it. This email is only the nudge.</p>
    `,
    };
  },

  // Decision 2h: a participant in a homeowner to builder conversation has a
  // new message waiting. THIS MAIL CARRIES NO MESSAGE. Not the text, not a
  // preview, not the homeowner's name, email address or phone number, and not
  // the builder's name either: only that a message is waiting on ADUAtlas and
  // the page it is on. `data` comes from the participant resolver, never from
  // the request, and holds one thing, which side the recipient is on. The
  // ADUAtlas thread is the record; replying to this email reaches ADUAtlas's
  // own inbox and not the other participant, and the copy says so, so nobody
  // answers here in the belief that the other side will read it.
  "message-waiting": ({ base, data }) => {
    const toBuilder = data.recipientSide === "builder";
    const path = toBuilder ? "/builder/messages" : "/messages";
    return {
      subject: "You have a new message on ADUAtlas",
      html: `
      <p>${toBuilder ? "A homeowner has sent you a new message on ADUAtlas." : "A builder you wrote to has sent you a new message on ADUAtlas."}</p>
      <p>The message is not in this email. Sign in to ADUAtlas to read it and reply:</p>
      <p><a href="${esc(base)}${path}">${esc(base)}${path}</a></p>
      <p>Your conversation is kept on ADUAtlas. A reply to this email does not reach ${toBuilder ? "the homeowner" : "the builder"}.</p>
    `,
    };
  },
};

// Which proof each template requires. A template with no entry here cannot be
// sent at all, so adding one is a deliberate act.
const AUTH = {
  "complete-plan": "lead",
  "welcome": "buyer",
  "refund-requested": "self",
  "refund-request-ops": "ops",
  // A new introduction has to land in a human inbox, so it is the second "ops"
  // template: a verified caller, the fixed OPS_EMAIL recipient, no third party.
  "intro-request-ops": "ops",
  "magic-link": "self",
  // The two templates that reach somebody who is not the caller. "admin" is the
  // only mode that mails an address the caller does not own, which is why it
  // resolves that address from a record instead of taking one.
  "builder-invitation": "admin",
  "intro-forward": "admin",
  // Decision 2h. A participant of a conversation tells the OTHER participant a
  // message is waiting. The recipient is resolved from the record, like
  // "admin", but the proof is being in the conversation, not holding a role.
  "message-waiting": "participant",
};

// ── Proofs ───────────────────────────────────────────────────────────────────

// The caller's Supabase access token, verified the way api/_admin.js verifies
// one. Also returns the tier recorded on that account, so the welcome copy can
// describe what this person actually bought.
const identifyCaller = async (req) => {
  const svc = service();
  if (!svc) return { configured: false, email: "", tier: null };
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return { configured: true, email: "", tier: null };

  let authUser = null;
  try {
    const { data, error } = await svc.auth.getUser(token);
    if (!error) authUser = data?.user || null;
  } catch {
    // A network or Supabase fault must refuse the send, not 500 the endpoint.
    return { configured: true, email: "", tier: null };
  }
  const email = normalizeEmail(authUser?.email);
  if (!email) return { configured: true, email: "", tier: null };

  let tier = null;
  try {
    const { data: row } = await svc
      .from("users")
      .select("paid_at, paid_tier, refunded_at")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    if (row?.paid_at && !row.refunded_at) tier = planById(row.paid_tier)?.id || null;
  } catch {
    // Tier stays null and the copy falls back to the package-free wording.
  }
  return { configured: true, email, tier };
};

// The caller as an ADMIN, which is the proof the two builder-facing templates
// need. The token is verified exactly the way api/_admin.js verifies one and the
// role is then READ FROM public.users: a header, a query string or a body field
// claiming to be an admin is never consulted, because that is the whole point.
// Every failure — no token, a Supabase fault, no matching row, any role other
// than admin — comes back admin:false, so this fails CLOSED. The service client
// is handed back with it, since a caller who passed is also the one entitled to
// resolve a record with it.
const identifyAdminCaller = async (req) => {
  const svc = service();
  if (!svc) return { configured: false, admin: false, email: "", svc: null };
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return { configured: true, admin: false, email: "", svc };

  let authUser = null;
  try {
    const { data, error } = await svc.auth.getUser(token);
    if (!error) authUser = data?.user || null;
  } catch {
    // A network or Supabase fault must refuse the send, not 500 the endpoint.
    return { configured: true, admin: false, email: "", svc };
  }
  if (!authUser) return { configured: true, admin: false, email: "", svc };

  try {
    const { data: row } = await svc
      .from("users")
      .select("email, role")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    if (row?.role !== "admin") return { configured: true, admin: false, email: "", svc };
    // The address is for the rate-limit key and the log, never for the copy. A
    // row with an odd address still belongs to an admin, so adminness does not
    // depend on the address parsing.
    return { configured: true, admin: true, email: normalizeEmail(row.email || authUser.email), svc };
  } catch {
    return { configured: true, admin: false, email: "", svc };
  }
};

// The caller as a PARTICIPANT, the proof "message-waiting" needs. The token is
// verified exactly the way api/_admin.js verifies one and the caller's
// public.users id is read from the database, because both conversation roles
// are keyed on that id (builder_conversations.homeowner_user_id and
// builders.owner_user_id). No header or body field names the caller. Every
// failure comes back userId:null, so this fails CLOSED like the admin proof,
// and the service client is handed back for the resolver below.
const identifyParticipantCaller = async (req) => {
  const svc = service();
  if (!svc) return { configured: false, userId: null, svc: null };
  const authz = req.headers.authorization || req.headers.Authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return { configured: true, userId: null, svc };

  let authUser = null;
  try {
    const { data, error } = await svc.auth.getUser(token);
    if (!error) authUser = data?.user || null;
  } catch {
    // A network or Supabase fault must refuse the send, not 500 the endpoint.
    return { configured: true, userId: null, svc };
  }
  if (!authUser) return { configured: true, userId: null, svc };

  try {
    const { data: row } = await svc
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    return { configured: true, userId: row?.id || null, svc };
  } catch {
    return { configured: true, userId: null, svc };
  }
};

// Every record id in this file is a Postgres uuid. Checking the shape here keeps
// a malformed id a 400 with a reason instead of a 22P02 surfacing as a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recordId = (raw) => {
  const s = typeof raw === "string" ? raw.trim() : "";
  return UUID_RE.test(s) ? s : "";
};

// WHERE AN "admin" TEMPLATE'S MAIL GOES, and what it is allowed to say. One
// resolver per template. Each one reads the named record with the service client
// and returns { recipient, data } or { status, error }; nothing from the request
// body passes through into `data`, so the claim code in an invitation and the
// message in a forward are the record's, not the caller's.
//
// A refusal is always specific. "Sent" when nothing was sent is the failure
// mode that matters here: an admin working through 86 seeded Arizona builders
// has to be able to tell the difference between a builder who was invited and a
// builder whose row has no address.
const ADMIN_RECIPIENTS = {
  // The builders row. The invitation's whole purpose is to carry the claim code,
  // so a row without one has nothing to invite anybody to do and is refused;
  // issue a code first. A claimed row has no code by construction (the 0007
  // builders_on_claim trigger retires it at the one choke point every
  // owner_user_id write passes through), and it is reported separately so the
  // console can say which of the two it was.
  "builder-invitation": async (svc, body) => {
    const id = recordId(body.builderId);
    if (!id) return { status: 400, error: "builderId required" };
    let row = null;
    try {
      const { data, error } = await svc
        .from("builders")
        .select("id, name, slug, contact_email, claim_code, owner_user_id")
        .eq("id", id)
        .maybeSingle();
      if (error) return { status: 500, error: error.message };
      row = data;
    } catch (err) {
      return { status: 500, error: err.message || "builder lookup failed" };
    }
    if (!row) return { status: 404, error: "builder not found" };
    if (row.owner_user_id) return { status: 409, error: "this listing is already claimed, so there is nothing to invite" };
    const recipient = normalizeEmail(row.contact_email);
    if (!recipient) return { status: 409, error: "this builder has no contact email on record, so the invitation has nowhere to go" };
    if (!row.claim_code) return { status: 409, error: "no claim code is issued for this builder. Issue one first: the code is what the invitation carries." };
    return { recipient, data: { name: row.name, slug: row.slug, claimCode: row.claim_code } };
  },

  // The intro_requests row, and through it the builder's own contact address.
  // THE HOMEOWNER'S ROW IS NOT SELECTED. Under decision 8 the only thing of
  // theirs that may leave ADUAtlas is the message they chose to write, so their
  // name and address are never fetched and cannot end up in the mail.
  //
  // A declined introduction is refused: forwarding one an admin has already
  // turned down is a mistake worth stopping. A 'sent' one is not refused, so a
  // forward that bounced or went astray can be sent again.
  "intro-forward": async (svc, body) => {
    const id = recordId(body.introId);
    if (!id) return { status: 400, error: "introId required" };
    let row = null;
    try {
      const { data, error } = await svc
        .from("intro_requests")
        .select("id, message, status, builders!inner(name, contact_email)")
        .eq("id", id)
        .maybeSingle();
      if (error) return { status: 500, error: error.message };
      row = data;
    } catch (err) {
      return { status: 500, error: err.message || "introduction lookup failed" };
    }
    if (!row) return { status: 404, error: "introduction request not found" };
    if (row.status === "declined") return { status: 409, error: "this introduction was declined, so it is not forwarded" };
    const recipient = normalizeEmail(row.builders?.contact_email);
    if (!recipient) return { status: 409, error: "this builder has no contact email on record, so the introduction cannot be forwarded by email" };
    return { recipient, data: { builderName: row.builders?.name, message: row.message } };
  },
};

// WHERE A "participant" TEMPLATE'S MAIL GOES. Three steps per template, because
// the answer to "may you ask?" has to come before "is mail configured?" (a
// stranger is refused on every deployment, configured or not) and the stamp
// has to come after Resend accepts. Every step returns a reason CODE and never
// an address, so the response cannot tell a caller who the other participant
// is, and a refusal is the same whether the thread does not exist or is not
// theirs, so this cannot be used to probe conversation ids.
//
// "message-waiting" (decision 2h, 0011):
//   participant  the caller is the thread's homeowner, or the account that owns
//                its builder listing. owns_builder_conversation() keys on
//                builders.owner_user_id in the same way, so an account whose
//                listing was released is no longer a participant here either.
//   recipient    the OTHER participant's account email. A listing with no owner
//                (unclaimed, or released) has nobody to tell: nothing is sent.
//                Nothing is sent either when none of the caller's messages is
//                WAITING (unnotified and unread), or while an earlier mail from
//                this side is still OUTSTANDING: one of the caller's messages
//                was notified inside the quiet window and the recipient has not
//                read it yet, so the mail they already have says a message is
//                waiting. read_at is written only by the OTHER participant
//                (0011 builder_messages_mark_read), so the caller cannot clear
//                that condition to mail again. No message body is selected.
//                The waiting messages come back oldest first, and the oldest
//                one names the send: every request that sees the same waiting
//                messages, on any instance, builds the same Idempotency-Key,
//                and Resend delivers once for it.
//   settle       after Resend accepts, stamp notified_at on the caller's
//                waiting messages that the recipient step fetched.
const PARTICIPANT_RECIPIENTS = {
  "message-waiting": {
    participant: async (svc, userId, body, data) => {
      const id = recordId(body.conversationId || data.conversationId);
      if (!id) return { status: 400, reason: "bad-request" };
      const { data: row, error } = await svc
        .from("builder_conversations")
        .select("id, homeowner_user_id, builders!inner(owner_user_id)")
        .eq("id", id)
        .maybeSingle();
      if (error) return { status: 500, reason: "server-error" };
      const owner = row?.builders?.owner_user_id || null;
      const asHomeowner = Boolean(row) && row.homeowner_user_id === userId;
      const asBuilder = Boolean(row) && owner !== null && owner === userId;
      if (!asHomeowner && !asBuilder) return { status: 403, reason: "forbidden" };
      // An account on both sides of one thread has no OTHER participant.
      const otherUserId = asHomeowner && asBuilder ? null : asHomeowner ? owner : row.homeowner_user_id;
      return { id: row.id, author: asHomeowner ? "homeowner" : "builder", otherUserId };
    },
    recipient: async (svc, thread) => {
      if (!thread.otherUserId) return { status: 200, reason: "no-recipient" };
      const { data: other, error: uErr } = await svc.from("users").select("email").eq("id", thread.otherUserId).maybeSingle();
      if (uErr) return { status: 500, reason: "server-error" };
      const recipient = normalizeEmail(other?.email);
      if (!recipient) return { status: 200, reason: "no-recipient" };
      const { data: waiting, error: wErr } = await svc
        .from("builder_messages")
        .select("id")
        .eq("conversation_id", thread.id)
        .eq("author", thread.author)
        .is("notified_at", null)
        .is("read_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(200);
      if (wErr) return { status: 500, reason: "server-error" };
      if (!waiting?.length) return { status: 200, reason: "nothing-to-notify" };
      const since = new Date(Date.now() - MESSAGE_WAITING_QUIET_MS).toISOString();
      const { data: outstanding, error: oErr } = await svc
        .from("builder_messages")
        .select("id")
        .eq("conversation_id", thread.id)
        .eq("author", thread.author)
        .is("read_at", null)
        .gt("notified_at", since)
        .limit(1);
      if (oErr) return { status: 500, reason: "server-error" };
      if (outstanding?.length) return { status: 200, reason: "rate-limited" };
      const first = waiting[0].id;
      return {
        recipient,
        data: { recipientSide: thread.author === "homeowner" ? "builder" : "homeowner" },
        stamp: waiting.map((m) => m.id),
        first,
        // Ids only, never an address: the thread, the oldest waiting message
        // and the account it goes to (so a listing that changes hands between
        // two attempts is a new send, not a payload clash at Resend).
        idempotencyKey: `message-waiting/${thread.id}/${first}/${thread.otherUserId}`,
      };
    },
    settle: async (svc, thread, target) => {
      if (!target.stamp.length) return;
      const { error } = await svc
        .from("builder_messages")
        .update({ notified_at: new Date().toISOString() })
        .eq("conversation_id", thread.id)
        .eq("author", thread.author)
        .in("id", target.stamp)
        .is("notified_at", null);
      // The mail went out, so the answer is still "sent". A failed stamp can
      // only mean one extra notification later, and the log names no address.
      if (error) console.error("message-waiting: the email was accepted but notified_at was not stamped");
    },
  },
};

// A paid Stripe Checkout Session. The recipient is the address Stripe billed
// and the tier comes from the session metadata, so the browser decides neither.
const paidSessionProof = async (raw) => {
  const sessionId = typeof raw === "string" ? raw.trim() : "";
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session?.payment_status !== "paid") return null;
    const email = normalizeEmail(session.customer_details?.email || session.customer_email);
    if (!email) return null;
    return { email, tier: planById(session.metadata?.tier)?.id || null };
  } catch {
    return null;
  }
};

// Browsers send Origin on every POST, including a same-origin one. Kept as a
// cheap first filter on the one unauthenticated template; NOT a boundary, since
// a non-browser client sets this header to anything it wants.
const originAllowed = (req) => {
  const origin = String(req.headers.origin || "").replace(/\/+$/, "");
  if (!origin) return false;
  const allowed = new Set([appBase(req)]);
  const host = String(req.headers.host || "");
  if (/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) {
    allowed.add(`https://${host}`);
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) allowed.add(`http://${host}`);
  }
  return allowed.has(origin);
};

// The durable half of the lead-mode fence. The recipient must be an address
// ADUAtlas captured through its own email gate, and the capture must be recent.
// leads.created_at is written once (capture_lead's ON CONFLICT branch updates
// quiz_answers, source and the referral columns, never created_at), so each
// address gets exactly one window and it never reopens. Returns
// { configured, allowed }.
const LEAD_WINDOW_MS = 15 * 60 * 1000;
// Tolerance for clock skew between Postgres and the function instance, so a row
// inserted a moment ago is not read as being in the future.
const CLOCK_SKEW_MS = 60 * 1000;

const capturedLeadAllowed = async (email) => {
  const svc = service();
  if (!svc) return { configured: false, allowed: false };
  try {
    const { data, error } = await svc
      .from("leads")
      .select("created_at")
      .eq("email", email)
      .maybeSingle();
    if (error || !data?.created_at) return { configured: true, allowed: false };
    const age = Date.now() - new Date(data.created_at).getTime();
    if (!Number.isFinite(age)) return { configured: true, allowed: false };
    return { configured: true, allowed: age >= -CLOCK_SKEW_MS && age <= LEAD_WINDOW_MS };
  } catch {
    return { configured: true, allowed: false };
  }
};

// A speed bump against mail floods, not a guarantee: the counters live in one
// serverless instance's memory, so a burst spread across instances gets more
// than MAX_PER_WINDOW through. The durable constraint on the unauthenticated
// template is capturedLeadAllowed above; this limiter is what keeps the
// authenticated templates from being used to flood a single inbox.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

// "message-waiting" allows ONE attempt here per conversation, recipient and
// set of waiting messages (named by the oldest of them), so requests on this
// instance for messages whose mail is already in flight stop before Resend.
// An attempt that did not go out is forgotten again, so a failed send never
// blocks the retry. This map is per instance; what holds ACROSS instances is
// the Idempotency-Key the same set of waiting messages always produces (Resend
// delivers once per key) and, after a send, the outstanding test on
// notified_at and read_at in PARTICIPANT_RECIPIENTS.
const MESSAGE_WAITING_MAX = 1;
const MESSAGE_WAITING_QUIET_MS = WINDOW_MS;

const rateLimited = (key, max = MAX_PER_WINDOW) => {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
};

const clientIp = (req) => {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "unknown";
};

// Render and hand to Resend. Resend v6 returns { data, error } rather than
// throwing on an API-level failure, so a rejected send used to come back from
// this endpoint as a 200 with an undefined id: a silent failure on the very path
// that carries the refund promise. Both shapes are treated as failures now.
//
// idempotencyKey is optional and becomes Resend's Idempotency-Key header: for
// 24 hours a repeat of the same key and payload returns the first answer
// without sending again, and a repeat while the first is still in flight is
// refused with the error name "concurrent_idempotent_requests". `code` carries
// that name so a caller can tell a duplicate from a real failure.
const deliver = async ({ template, recipient, base, tier, data, caller, idempotencyKey }) => {
  if (!resend) return { ok: false, error: "RESEND_API_KEY not configured" };
  const build = TEMPLATES[template];
  if (!build) return { ok: false, error: `unknown template: ${template}` };
  const { subject, html } = build({ base, tier, data: data || {}, caller: caller || "" });
  try {
    const result = await resend.emails.send(
      { from: fromAddress(), to: recipient, subject, html },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    if (result?.error) return { ok: false, error: result.error.message || "resend error", code: result.error.name || "" };
    return { ok: true, id: result?.data?.id || null };
  } catch (err) {
    return { ok: false, error: err.message || "resend error" };
  }
};

// SERVER-TO-SERVER ONLY. Another serverless function in this repo (today
// api/stripe-webhook.js, which sends the welcome mail once per Stripe event)
// calls this after it has established for itself who the recipient is and what
// they bought. It deliberately bypasses the AUTH map above, because there is no
// HTTP caller to authenticate: the webhook's proof is Stripe's own signature.
// Nothing reachable from a request may call it, and it must never be handed a
// recipient that came from a request body.
//
// An /api/admin route may use this too, since requireAdmin() has already proved
// the same thing the "admin" mode proves and the route holds the same service
// client: it resolves the record itself, passes the address it read off that
// record, and builds `data` from the record for the same reason this file's
// resolvers do — a builder-invitation's claim code and an intro-forward's
// message must come from the row, and an intro-forward must carry nothing that
// identifies the homeowner (decision 8).
export const sendTemplateEmail = async ({ template, to, tier = null, data = {}, base = "" }) => {
  const recipient = normalizeEmail(to);
  if (!recipient) return { ok: false, error: "invalid recipient" };
  const resolvedBase = (base || process.env.APP_BASE_URL || "https://aduatlas.com").replace(/\/+$/, "");
  return deliver({ template, recipient, base: resolvedBase, tier, data, caller: recipient });
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = readBody(req);
  const template = typeof body.template === "string" ? body.template : "";
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const build = TEMPLATES[template];
  const mode = AUTH[template];

  // Every mode but "participant" refuses outright without a mail key, exactly
  // as before. A participant template must still refuse a stranger when mail is
  // not configured, and then answer "not-configured" as a reason code, so it
  // makes that decision itself below.
  if (!resend && mode !== "participant") {
    res.status(500).json({ error: "RESEND_API_KEY not configured" });
    return;
  }

  if (!build || !mode) {
    res.status(400).json({ error: `unknown template: ${template}` });
    return;
  }

  const base = appBase(req);

  // PARTICIPANT MODE. The answer is { sent, reason } and nothing else, on every
  // path, and this branch never throws: the client fires it without waiting and
  // a message is complete without it. `to` and `data` never reach the mail.
  if (mode === "participant") {
    const answer = (status, sent, reason) => res.status(status).json({ sent, reason });
    const resolver = PARTICIPANT_RECIPIENTS[template];
    if (!resolver) {
      answer(500, false, "server-error");
      return;
    }
    try {
      const who = await identifyParticipantCaller(req);
      if (!who.configured) {
        answer(500, false, "not-configured");
        return;
      }
      if (!who.userId) {
        answer(401, false, "authentication-required");
        return;
      }
      const thread = await resolver.participant(who.svc, who.userId, body, data);
      if (thread.status) {
        answer(thread.status, false, thread.reason);
        return;
      }
      // Only a participant learns this, and it says nothing about the other one.
      if (!resend) {
        answer(200, false, "not-configured");
        return;
      }
      const target = await resolver.recipient(who.svc, thread);
      if (target.status) {
        answer(target.status, false, target.reason);
        return;
      }
      const limitKey = `waiting:${thread.id}:${target.recipient}:${target.first}`;
      if (rateLimited(limitKey, MESSAGE_WAITING_MAX)) {
        answer(200, false, "rate-limited");
        return;
      }
      const sent = await deliver({
        template,
        recipient: target.recipient,
        base,
        tier: null,
        data: target.data,
        caller: "",
        idempotencyKey: target.idempotencyKey,
      });
      if (!sent.ok) {
        // Nothing went out, so this attempt does not hold the slot: the next
        // request for these messages may try again.
        hits.delete(limitKey);
        // Another instance is sending the mail for these same messages right
        // now. That send is the one that counts, and it stamps them.
        if (sent.code === "concurrent_idempotent_requests") {
          answer(200, false, "rate-limited");
          return;
        }
        // Resend's own error text can repeat the address, so it is not passed on.
        answer(502, false, "send-failed");
        return;
      }
      try {
        await resolver.settle(who.svc, thread, target);
      } catch {
        // The mail went out; see settle.
        console.error("message-waiting: the email was accepted but notified_at was not stamped");
      }
      answer(200, true, "sent");
    } catch {
      if (!res.headersSent) answer(500, false, "server-error");
    }
    return;
  }

  let recipient = "";
  let tier = null;
  let caller = "";
  // What the template is rendered with. For every mode but "admin" this is the
  // caller's own `data`; an admin template's words come from the record instead,
  // so that mode replaces it and the body's `data` is never read.
  let templateData = data;

  if (mode === "lead") {
    if (!originAllowed(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (rateLimited(`ip:${clientIp(req)}`)) {
      res.status(429).json({ error: "too many requests" });
      return;
    }
    const requested = normalizeEmail(body.to);
    if (!requested) {
      res.status(400).json({ error: "missing or invalid to" });
      return;
    }
    // The durable fence: only an address ADUAtlas itself just captured.
    const lead = await capturedLeadAllowed(requested);
    if (!lead.configured) {
      res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
      return;
    }
    if (!lead.allowed) {
      // Deliberately the same answer whether the address was never captured or
      // its window has closed, so this cannot be used to test whether a given
      // address is in the lead table.
      res.status(403).json({ error: "forbidden" });
      return;
    }
    recipient = requested;
  } else if (mode === "admin") {
    // An admin names a RECORD; the server decides the address. `to` is not read
    // here, and neither is `data`.
    const admin = await identifyAdminCaller(req);
    if (!admin.configured) {
      res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
      return;
    }
    if (!admin.admin) {
      // One answer for a missing token and for a signed-in non-admin, so this
      // cannot be used to probe who holds the role.
      res.status(403).json({ error: "forbidden" });
      return;
    }
    caller = admin.email;
    // AUTH and ADMIN_RECIPIENTS are two maps, so a future template could be
    // marked "admin" with no resolver behind it. That must refuse rather than
    // throw on an undefined call, because the throw would surface as a bare 500.
    const resolve = ADMIN_RECIPIENTS[template];
    if (!resolve) {
      res.status(500).json({ error: `no recipient resolver for template: ${template}` });
      return;
    }
    const resolved = await resolve(admin.svc, body);
    if (resolved.error) {
      res.status(resolved.status || 400).json({ error: resolved.error });
      return;
    }
    recipient = resolved.recipient;
    templateData = resolved.data;
  } else {
    // A paid Stripe session is the stronger proof and it also names the tier,
    // so it is tried first where a template accepts it.
    if (mode === "buyer") {
      const proof = await paidSessionProof(body.sessionId || data.sessionId);
      if (proof) {
        recipient = proof.email;
        caller = proof.email;
        tier = proof.tier;
      }
    }
    if (!recipient) {
      const identified = await identifyCaller(req);
      if (!identified.configured) {
        res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" });
        return;
      }
      caller = identified.email;
      tier = identified.tier;
      if (mode === "ops") {
        // The recipient is ours, from the environment. A verified caller is
        // still required, so this is not an open channel into our own inbox.
        if (!caller) {
          res.status(401).json({ error: "authentication required" });
          return;
        }
        recipient = opsAddress();
        if (!recipient) {
          res.status(500).json({ error: "OPS_EMAIL / RESEND_FROM not configured" });
          return;
        }
      } else {
        recipient = caller;
      }
    }
    if (!recipient) {
      // No verified identity and no proof of purchase: `to` is never honoured
      // here, so there is nowhere to send.
      res.status(401).json({ error: "authentication required" });
      return;
    }
  }

  // The operations address is a single inbox every refund request and every new
  // introduction lands in, so it is not rate limited by recipient; the caller is
  // instead, which is what stops one account flooding it.
  //
  // "admin" is limited by RECIPIENT and deliberately not by caller. Seeding a
  // state means inviting dozens of different companies from one admin account,
  // which is the intended use and must not be throttled; what needs stopping is
  // the same builder being mailed over and over, and that is what the recipient
  // key catches.
  const limitKey = mode === "ops" ? `ops:${caller}` : `to:${recipient}`;
  if (rateLimited(limitKey)) {
    res.status(429).json({ error: "too many requests" });
    return;
  }

  const sent = await deliver({ template, recipient, base, tier, data: templateData, caller });
  if (!sent.ok) {
    res.status(500).json({ error: sent.error });
    return;
  }
  res.status(200).json({ id: sent.id });
}
