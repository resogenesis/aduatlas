// Vercel-style serverless function: looks up public property records for an
// address and returns a normalized snapshot the /property page can render.
//
// Lot size / building size come from county assessor + parcel data, which has
// no free unified national API — so this proxies a property-data provider and
// keeps the API key server-side. Provider is swappable via env.
//
// Required env (server-side, never VITE_-prefixed):
//   PROPERTY_API_PROVIDER   "rentcast" (default) | future adapters
//   RENTCAST_API_KEY        from https://app.rentcast.io (free tier ~50/mo)
//
// Query: GET /api/property-lookup?address=<full address>
// Returns 200 { lotSize, buildingSize, yearBuilt, propertyType, source }
//   - lotSize / buildingSize in square feet (number) or null when unknown
//   - 501 { error: "not-configured" } when no provider key is set (frontend
//     then falls back to example data — the page still renders).
//
// NOTE: verify Rentcast's exact endpoint + field names against their current
// docs before relying in production; the adapter normalizes defensively.

const PROVIDERS = {
  rentcast: async (address) => {
    const key = process.env.RENTCAST_API_KEY;
    if (!key) return { configured: false };

    const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`;
    const resp = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" } });
    if (!resp.ok) throw new Error(`rentcast ${resp.status}`);

    const json = await resp.json();
    const rec = Array.isArray(json) ? json[0] : json;
    if (!rec) return { configured: true, found: false };

    return {
      configured: true,
      found: true,
      data: {
        lotSize: numberOrNull(rec.lotSize),
        buildingSize: numberOrNull(rec.squareFootage),
        yearBuilt: numberOrNull(rec.yearBuilt),
        propertyType: rec.propertyType || null,
        source: "Public records · Rentcast",
      },
    };
  },
};

const numberOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default async function handler(req, res) {
  const address = (req.query?.address || "").trim();
  if (!address) {
    res.status(400).json({ error: "address required" });
    return;
  }

  const providerName = (process.env.PROPERTY_API_PROVIDER || "rentcast").toLowerCase();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    res.status(500).json({ error: `unknown provider: ${providerName}` });
    return;
  }

  try {
    const result = await provider(address);
    if (!result.configured) {
      res.status(501).json({ error: "not-configured" });
      return;
    }
    if (!result.found) {
      res.status(404).json({ error: "no-record" });
      return;
    }
    res.status(200).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message || "lookup failed" });
  }
}
