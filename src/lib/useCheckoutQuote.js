// React hook over fetchCheckoutQuote (src/lib/checkout.js). Returns
//   undefined          while the server has not answered
//   { ok: true, ... }  the quote: listCents, creditCents, dueCents, creditFrom
//   { ok: false, ... } no figure to show (or already_has_plan)
// and asks again when the tier or the signed-in account changes. The caller's
// access token goes with the request, because the credit belongs to the account
// the token proves and to nobody else.
import { useEffect, useState } from "react";
import { fetchCheckoutQuote } from "./checkout";
import { accessToken, currentUser } from "../stores/authStore";

// `refresh` changes to ask again (after checkout answered price_changed).
export const useCheckoutQuote = (tier, refresh = 0) => {
  const uid = currentUser()?.id || "";
  const [result, setResult] = useState({ key: null, quote: undefined });
  const key = `${uid}:${tier || ""}:${refresh}`;
  useEffect(() => {
    if (!tier) return undefined;
    let live = true;
    (async () => {
      const token = uid ? await accessToken() : "";
      const quote = await fetchCheckoutQuote({ tier, accessToken: token });
      if (live) setResult({ key, quote });
    })();
    return () => {
      live = false;
    };
  }, [tier, uid, key]);
  return result.key === key ? result.quote : undefined;
};
