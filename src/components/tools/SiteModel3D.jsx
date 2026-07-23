// Stylized 3D site model — the "miniature architectural model on a table."
//
// This is the primary premium view: the homeowner's lot as a clean 3D model
// they can orbit, not a satellite photo. Reads the same lotModel as the 2D
// plan. Light existing-home mass, lime proposed ADU, red lot boundary, dashed
// setback outline, low-poly trees, soft shadows. Lazy-loaded (Canvas + three
// are heavy) so the map/plan render instantly and 3D streams in on demand.
//
// Coordinate mapping — model is in FEET (x=width, y=depth, origin front-left).
// Three.js scene is centered on the lot: X=width, Z=depth, Y=height. 1 unit = 1 ft.

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, SoftShadows, Line } from "@react-three/drei";

const ACCENT = "#C6F24E";
const HOME_COLOR = "#CBD5C0";
const LOT_COLOR = "#E8776B";
const GROUND = "#14160F";
const TABLE = "#0B0C08";

const HOME_HEIGHT = 18; // ft — ~1.5 story existing home
const ADU_HEIGHT = 14; // ft — single-story detached ADU

// Model rect {x,y,w,d} → centered three-space { cx, cz, w, d }.
const centered = (r, lotW, lotD) => ({
  cx: r.x + r.w / 2 - lotW / 2,
  cz: r.y + r.d / 2 - lotD / 2,
  w: r.w,
  d: r.d,
});

// A simple low-poly tree: trunk + two stacked cones of foliage.
function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.7, 6, 6]} />
        <meshStandardMaterial color="#6b5b43" />
      </mesh>
      <mesh position={[0, 8, 0]} castShadow>
        <coneGeometry args={[4, 8, 8]} />
        <meshStandardMaterial color="#4a6b3a" />
      </mesh>
      <mesh position={[0, 12.5, 0]} castShadow>
        <coneGeometry args={[3, 6, 8]} />
        <meshStandardMaterial color="#557a44" />
      </mesh>
    </group>
  );
}

// Outline of a rect on the ground (lot boundary solid, setback band dashed).
function GroundOutline({ rect, lotW, lotD, color, y = 0.15, dashed = false, lineWidth = 2 }) {
  const c = centered(rect, lotW, lotD);
  const hw = c.w / 2;
  const hd = c.d / 2;
  const pts = [
    [c.cx - hw, y, c.cz - hd],
    [c.cx + hw, y, c.cz - hd],
    [c.cx + hw, y, c.cz + hd],
    [c.cx - hw, y, c.cz + hd],
    [c.cx - hw, y, c.cz - hd],
  ];
  return (
    <Line
      points={pts}
      color={color}
      lineWidth={lineWidth}
      dashed={dashed}
      dashSize={2}
      gapSize={1.5}
    />
  );
}

function Massing({ rect, lotW, lotD, height, color, opacity = 1, label }) {
  const c = centered(rect, lotW, lotD);
  return (
    <group position={[c.cx, 0, c.cz]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[c.w, height, c.d]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.7} />
      </mesh>
      {label && (
        <Html position={[0, height + 4, 0]} center distanceFactor={120}>
          <div className="px-2 py-0.5 rounded-md bg-canvas/90 border border-stroke text-paper text-[11px] font-semibold whitespace-nowrap pointer-events-none">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({ model, showSetbacks, showDimensions, showShadows }) {
  const { lot, buildable, home, adu } = model;
  const lotW = lot.w;
  const lotD = lot.d;
  const diag = Math.hypot(lotW, lotD);

  return (
    <>
      {showShadows && <SoftShadows size={28} samples={12} focus={0.6} />}
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#dfe6d8", "#20241a", 0.5]} />
      <directionalLight
        position={[lotW * 0.7, diag * 1.1, lotD * 0.4]}
        intensity={1.15}
        castShadow={showShadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-diag}
        shadow-camera-right={diag}
        shadow-camera-top={diag}
        shadow-camera-bottom={-diag}
        shadow-camera-far={diag * 3}
      />

      {/* Table the model sits on */}
      <mesh position={[0, -0.6, 0]} receiveShadow>
        <boxGeometry args={[lotD * 1.5, 1, lotD * 1.5]} />
        <meshStandardMaterial color={TABLE} roughness={1} />
      </mesh>

      {/* Lot ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[lotW, lotD]} />
        <meshStandardMaterial color={GROUND} roughness={1} />
      </mesh>

      {/* Buildable band tint */}
      {showSetbacks && buildable && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            centered(buildable, lotW, lotD).cx,
            0.05,
            centered(buildable, lotW, lotD).cz,
          ]}
        >
          <planeGeometry args={[buildable.w, buildable.d]} />
          <meshStandardMaterial color={ACCENT} transparent opacity={0.12} />
        </mesh>
      )}

      {/* Property boundary (solid red) */}
      <GroundOutline rect={lot} lotW={lotW} lotD={lotD} color={LOT_COLOR} y={0.2} lineWidth={2.5} />
      {/* Setback outline (dashed lime) */}
      {showSetbacks && buildable && (
        <GroundOutline rect={buildable} lotW={lotW} lotD={lotD} color={ACCENT} y={0.12} dashed lineWidth={1.5} />
      )}

      {/* Existing home */}
      {home && (
        <Massing
          rect={home}
          lotW={lotW}
          lotD={lotD}
          height={HOME_HEIGHT}
          color={HOME_COLOR}
          opacity={0.92}
          label={showDimensions ? `Home ${Math.round(home.w)}′×${Math.round(home.d)}′` : undefined}
        />
      )}

      {/* Proposed ADU */}
      {adu && (
        <Massing
          rect={adu}
          lotW={lotW}
          lotD={lotD}
          height={ADU_HEIGHT}
          color={ACCENT}
          opacity={0.95}
          label={showDimensions ? `ADU ${Math.round(adu.w)}′×${Math.round(adu.d)}′` : undefined}
        />
      )}

      {/* A few trees in the front yard corners for scale/context */}
      <Tree position={[-lotW / 2 + 5, 0, -lotD / 2 + 6]} scale={0.9} />
      <Tree position={[lotW / 2 - 5, 0, -lotD / 2 + 10]} scale={1.05} />
      {adu && <Tree position={[lotW / 2 - 6, 0, lotD / 2 - 6]} scale={0.8} />}

      <OrbitControls
        enablePan
        enableZoom
        minDistance={diag * 0.5}
        maxDistance={diag * 2.4}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 4, 0]}
      />
    </>
  );
}

const SiteModel3D = ({ model, showSetbacks = true, showDimensions = true, showShadows = true }) => {
  const diag = Math.hypot(model.lot.w, model.lot.d) || 120;
  return (
    <div className="h-[440px] lg:h-[560px] w-full rounded-2xl overflow-hidden border border-stroke bg-canvas">
      <Canvas
        shadows={showShadows}
        dpr={[1, 2]}
        camera={{ position: [diag * 0.55, diag * 0.7, diag * 0.95], fov: 38, near: 1, far: diag * 6 }}
      >
        <color attach="background" args={["#0E0F0C"]} />
        <Scene
          model={model}
          showSetbacks={showSetbacks}
          showDimensions={showDimensions}
          showShadows={showShadows}
        />
      </Canvas>
    </div>
  );
};

export default SiteModel3D;
