// The harness proves it can reach the target and refuses production before any check runs.
export const meta = { name: "000 harness" };
export default async function (ctx) {
  const home = await ctx.fetchJson(`${ctx.base}/`);
  return [
    { name: "target-reachable", rule: "the suite is pointed at a live deployment", status: home.status === 200 ? "pass" : "fail", detail: `GET / -> ${home.status}` },
    { name: "target-is-not-production", rule: "behavioural checks never run against production", status: /aduatlas\.com/i.test(ctx.base) ? "fail" : "pass", detail: ctx.base },
  ];
}
