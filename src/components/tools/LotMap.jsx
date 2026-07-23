import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Satellite lot map with a 2D↔3D toggle and an extruded ADU massing box.
//
// This is the FutureLot-style "wow": a real aerial centered on the looked-up
// parcel, with the setback band, the existing home, and the largest ADU drawn
// on top — the ADU extruded so tilting the camera reads as a 3D model dropped
// on the lot.
//
// HONEST SCOPE (Phase 1): the parcel outline here is a north-aligned rectangle
// derived from lot AREA (RentCast gives area, not a polygon), NOT the true
// surveyed boundary. It's centered on the property's real coordinates so the
// imagery is correct, but the shape is an estimate the homeowner refines with
// the dimension inputs. Real parcel polygons come in Phase 2 (Regrid).
//
// No API key: MapLibre GL (open-source) + Esri World Imagery raster tiles
// (free, attribution-only). No Mapbox token required.

const ACCENT = "#C6F24E"; // brand lime
const FT_PER_M = 3.28084;
const ADU_HEIGHT_M = 4.2; // ~13.8 ft — a single-story ADU, for the 3D box

// Esri World Imagery — free satellite basemap, attribution required.
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

// Feet offsets (east, north) → [lng, lat] around a center. Small-angle flat
// approximation; fine at parcel scale.
const makeProjector = (centerLng, centerLat) => {
  const latRad = (centerLat * Math.PI) / 180;
  const dLatPerFt = 0.3048 / 111320;
  const dLngPerFt = 0.3048 / (111320 * Math.cos(latRad));
  return (eastFt, northFt) => [
    centerLng + eastFt * dLngPerFt,
    centerLat + northFt * dLatPerFt,
  ];
};

// Build all polygons from the lot dims. Front setback is the north edge; the
// existing home sits at the front of the buildable band, the ADU behind it.
const buildFeatures = (p) => {
  const { lat, lng } = p;
  const halfW = p.lotWidth / 2;
  const halfD = p.lotDepth / 2;
  const proj = makeProjector(lng, lat);

  const rect = (west, east, south, north) => [
    [proj(west, north), proj(east, north), proj(east, south), proj(west, south), proj(west, north)],
  ];

  // Lot outline
  const lot = rect(-halfW, halfW, -halfD, halfD);

  // Buildable band (inside setbacks)
  const bW = Math.max(0, halfW - p.side);
  const innerFront = halfD - p.front; // north line
  const innerRear = -(halfD - p.rear); // south line
  const band = innerFront > innerRear && bW > 0 ? rect(-bW, bW, innerRear, innerFront) : null;

  // Existing home — front of the buildable band
  const homeBottom = Math.max(innerRear, innerFront - p.houseDepth);
  const home = bW > 0 && innerFront > homeBottom ? rect(-bW, bW, homeBottom, innerFront) : null;

  // ADU — rear yard behind the home
  const adu = bW > 0 && homeBottom > innerRear ? rect(-bW, bW, innerRear, homeBottom) : null;

  const bounds = [proj(-halfW, -halfD), proj(halfW, halfD)];
  return { lot, band, home, adu, bounds };
};

const poly = (coordinates, props = {}) => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates },
  properties: props,
});

const LotMap = ({ lat, lng, lotWidth, lotDepth, front, rear, side, houseDepth }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const [is3D, setIs3D] = useState(false);

  // Init the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [lng, lat],
      zoom: 18,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
      dragRotate: true,
      maxZoom: 20,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      readyRef.current = true;
      map.addSource("lot", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("band", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("home", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("adu", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      map.addLayer({
        id: "band-fill",
        type: "fill",
        source: "band",
        paint: { "fill-color": ACCENT, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "lot-line",
        type: "line",
        source: "lot",
        paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "home-fill",
        type: "fill-extrusion",
        source: "home",
        paint: {
          "fill-extrusion-color": "#cbd5c0",
          "fill-extrusion-height": 3,
          "fill-extrusion-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "adu-fill",
        type: "fill-extrusion",
        source: "adu",
        paint: {
          "fill-extrusion-color": ACCENT,
          "fill-extrusion-height": ADU_HEIGHT_M,
          "fill-extrusion-opacity": 0.85,
        },
      });
      updateData();
      fitToLot();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new geometry whenever dims or coordinates change.
  const updateData = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const f = buildFeatures({ lat, lng, lotWidth, lotDepth, front, rear, side, houseDepth });
    map.getSource("lot")?.setData({ type: "FeatureCollection", features: [poly(f.lot)] });
    map.getSource("band")?.setData({
      type: "FeatureCollection",
      features: f.band ? [poly(f.band)] : [],
    });
    map.getSource("home")?.setData({
      type: "FeatureCollection",
      features: f.home ? [poly(f.home)] : [],
    });
    map.getSource("adu")?.setData({
      type: "FeatureCollection",
      features: f.adu ? [poly(f.adu)] : [],
    });
    return f.bounds;
  };

  const fitToLot = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const f = buildFeatures({ lat, lng, lotWidth, lotDepth, front, rear, side, houseDepth });
    map.fitBounds(f.bounds, { padding: 48, maxZoom: 20, duration: 0 });
  };

  // Re-center + refit when the looked-up property changes.
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    updateData();
    fitToLot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // Re-draw (no refit) when the homeowner tweaks dimensions.
  useEffect(() => {
    updateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotWidth, lotDepth, front, rear, side, houseDepth]);

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);
    map.easeTo({ pitch: next ? 55 : 0, bearing: next ? -18 : 0, duration: 700 });
  };

  const aduFt = Math.round(ADU_HEIGHT_M * FT_PER_M);

  return (
    <div className="relative rounded-xl overflow-hidden border border-stroke">
      <div ref={containerRef} className="h-[440px] lg:h-[560px] w-full bg-canvas" />

      {/* 2D / 3D toggle */}
      <button
        type="button"
        onClick={toggle3D}
        className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-canvas/85 backdrop-blur border border-stroke text-paper text-xs font-semibold hover:border-accent transition-colors"
      >
        {is3D ? "2D view" : "3D view"}
      </button>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 rounded-lg bg-canvas/85 backdrop-blur border border-stroke text-[11px] text-paper-dim">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#cbd5c0" }} /> Existing home
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: ACCENT }} /> ADU (~{aduFt} ft tall)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-dashed border-white" /> Lot line
        </span>
      </div>
    </div>
  );
};

export default LotMap;
