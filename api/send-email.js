// Vercel-style serverless function: sends transactional email via Resend.
//
// Required env:
//   RESEND_API_KEY
//   RESEND_FROM    (e.g. hello@aduatlas.com — must be verified in Resend)
//
// Body shape (POST JSON):
//   { template: "complete-plan" | "welcome" | "refund-requested" | "magic-link",
//     to: string,
//     data: object }
//
// Templates are inline string builders for now. Swap to MJML / React Email
// when copy stabilizes.

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const TEMPLATES = {
  "complete-plan": (data) => ({
    subject: "Complete your ADU plan",
    html: `
      <p>You started your ADU Reality Check on ADUAtlas. Pick up where you left off:</p>
      <p><a href="${data.url || "https://aduatlas.com/quiz"}">Continue your plan →</a></p>
      <p>The full Feasibility Report unlocks every yellow row in your snapshot, gives you a builder-ready RFP, and includes a 7-day full refund.</p>
    `,
  }),

  "welcome": (data) => ({
    subject: "Your ADUAtlas access is unlocked",
    html: `
      <p>Welcome to ADUAtlas Paid Access.</p>
      <p>Start with your dashboard: <a href="${data.dashboardUrl || "https://aduatlas.com/dashboard"}">${data.dashboardUrl || "aduatlas.com/dashboard"}</a></p>
      <p>Your Feasibility Report is generated as you complete your project brief and the course chapters.</p>
      <p>7-day full refund. Just reply to this email.</p>
    `,
  }),

  "refund-requested": (data) => ({
    subject: "Refund request received",
    html: `
      <p>We've received your refund request and someone from our team will respond within one business day.</p>
      <p>If you can share what didn't work for you (no obligation), it helps us fix it for the next homeowner.</p>
      ${data.note ? `<p>Your note: ${data.note}</p>` : ""}
    `,
  }),

  "magic-link": (data) => ({
    subject: "Your sign-in link",
    html: `
      <p>Click to sign in to ADUAtlas:</p>
      <p><a href="${data.link}">${data.link}</a></p>
      <p>This link expires in 15 minutes.</p>
    `,
  }),
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!resend) {
    res.status(500).json({ error: "RESEND_API_KEY not configured" });
    return;
  }

  const { template, to, data = {} } = req.body || {};
  const builder = TEMPLATES[template];
  if (!builder) {
    res.status(400).json({ error: `unknown template: ${template}` });
    return;
  }
  if (!to) {
    res.status(400).json({ error: "missing to" });
    return;
  }

  const { subject, html } = builder(data);

  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM || "hello@aduatlas.com",
      to,
      subject,
      html,
    });
    res.status(200).json({ id: result.data?.id });
  } catch (err) {
    res.status(500).json({ error: err.message || "resend error" });
  }
}
