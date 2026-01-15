import { useMemo, useState, useEffect, useRef } from 'react';
import Plot from 'react-plotly.js';
import { useQamposer } from '../../hooks/useQamposer';
import type { QSpherePoint } from '../../types';
import './QSphereView.scss';

// Color constants
const BG = 'rgba(12,16,22,0.96)';
const RING = 'rgba(255,255,255,0.35)';
const SPOKE = 'rgba(80,140,255,0.55)';

// Camera configuration
interface CameraPosition {
  eye: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
}

const DEFAULT_CAMERA: CameraPosition = {
  eye: { x: 1.35, y: 1.35, z: 1.05 },
  center: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
};

// Sphere generation parameters
const RESOLUTION_THETA = 48;
const RESOLUTION_PHI = 96;

export interface QSphereViewProps {
  className?: string;
}

// Format phase as fraction of pi
function formatPhaseFraction(phase: number): string {
  const pi = Math.PI;
  const normalized = ((phase % (2 * pi)) + 2 * pi) % (2 * pi);
  const frac = normalized / pi;
  const snapped = Math.round(frac * 4) / 4;

  if (snapped === 0) return '0';
  if (snapped === 2) return '2π';

  const numerator = snapped * 4;
  const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
  const g = gcd(Math.abs(numerator), 4);
  const n = numerator / g;
  const d = 4 / g;

  return d === 1 ? `${n}π` : `${n}π/${d}`;
}

// Build circle points for rings
function buildCircle(
  theta: number,
  isMeridian: boolean = false
): { x: number[]; y: number[]; z: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];

  for (let j = 0; j <= RESOLUTION_PHI; j++) {
    const phi = (2 * Math.PI * j) / RESOLUTION_PHI;
    if (isMeridian) {
      x.push(Math.sin(phi) * Math.sin(theta));
      y.push(Math.cos(phi) * Math.sin(theta));
      z.push(Math.cos(theta));
    } else {
      x.push(Math.sin(theta) * Math.cos(phi));
      y.push(Math.sin(theta) * Math.sin(phi));
      z.push(Math.cos(theta));
    }
  }

  return { x, y, z };
}

// Generate unit sphere surface data
function generateSphereSurface(): {
  x: number[][];
  y: number[][];
  z: number[][];
  surfacecolor: number[][];
} {
  const x: number[][] = [];
  const y: number[][] = [];
  const z: number[][] = [];
  const surfacecolor: number[][] = [];

  for (let i = 0; i <= RESOLUTION_THETA; i++) {
    const theta = (Math.PI * i) / RESOLUTION_THETA;
    const rowX: number[] = [];
    const rowY: number[] = [];
    const rowZ: number[] = [];
    const rowC: number[] = [];

    for (let j = 0; j <= RESOLUTION_PHI; j++) {
      const phi = (2 * Math.PI * j) / RESOLUTION_PHI;
      rowX.push(Math.sin(theta) * Math.cos(phi));
      rowY.push(Math.sin(theta) * Math.sin(phi));
      rowZ.push(Math.cos(theta));
      rowC.push(1 - Math.abs(Math.cos(theta)) * 0.35);
    }

    x.push(rowX);
    y.push(rowY);
    z.push(rowZ);
    surfacecolor.push(rowC);
  }

  return { x, y, z, surfacecolor };
}

// Generate radial lines from center to each point
function generateRadialLines(points: QSpherePoint[]): {
  x: (number | null)[];
  y: (number | null)[];
  z: (number | null)[];
} {
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  const z: (number | null)[] = [];

  points.forEach((p) => {
    x.push(0, p.x, null);
    y.push(0, p.y, null);
    z.push(0, p.z, null);
  });

  return { x, y, z };
}

export function QSphereView({ className = '' }: QSphereViewProps) {
  const { result } = useQamposer();
  const points = result?.qsphere;

  const [showStateLabels, setShowStateLabels] = useState(true);
  const [showPhaseLabels, setShowPhaseLabels] = useState(false);
  const [camera, setCamera] = useState<CameraPosition>(DEFAULT_CAMERA);
  const plotRef = useRef<Plot>(null);

  useEffect(() => {
    const handleResize = () => {
      const plotElement = plotRef.current as unknown as { resizeHandler?: () => void };
      if (plotElement?.resizeHandler) {
        plotElement.resizeHandler();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Generate label text for each point
  const labelText = useMemo(
    () =>
      (points || []).map((p) => {
        const parts: string[] = [];
        if (showStateLabels) parts.push(`|${p.state}⟩`);
        if (showPhaseLabels) parts.push(`φ=${formatPhaseFraction(p.phase)}`);
        return parts.join('<br>');
      }),
    [points, showPhaseLabels, showStateLabels]
  );

  if (!points || points.length === 0) {
    return (
      <div className={`qsphere-view ${className}`.trim()}>
        <div className="qsphere-view__placeholder">
          <p>No Q-sphere data available (run a simulation with ≤ 5 qubits).</p>
        </div>
      </div>
    );
  }

  // Extract point data
  const x = points.map((p) => p.x);
  const y = points.map((p) => p.y);
  const z = points.map((p) => p.z);
  const sizes = points.map((p) => 6 + 18 * Math.sqrt(p.probability));
  const phases = points.map((p) => p.phase);

  // Generate hover text
  const hoverText = points.map(
    (p) =>
      `<b>State |${p.state}⟩</b>` +
      `<br>Probability: ${p.probability.toFixed(3)}` +
      `<br>Phase angle: ${formatPhaseFraction(p.phase)}`
  );

  // Generate sphere surface
  const sphereData = generateSphereSurface();

  // Generate ring data
  const equatorRing = buildCircle(Math.PI / 2);
  const meridianRing = buildCircle(0, true);

  // Generate radial lines
  const radialData = generateRadialLines(points);

  // Axis style - hide all axis elements for clean Q-sphere look
  const hiddenAxisStyle = {
    range: [-1.1, 1.1],
    showgrid: false,
    showline: false,
    zeroline: false,
    showticklabels: false,
    showspikes: false,
    title: { text: '' },
    showbackground: false,
  };

  // Plotly traces (using type assertion due to incomplete Plotly type definitions)
  const traces = [
    // Sphere surface
    {
      type: 'surface' as const,
      x: sphereData.x,
      y: sphereData.y,
      z: sphereData.z,
      surfacecolor: sphereData.surfacecolor,
      showscale: false,
      opacity: 0.32,
      hoverinfo: 'skip' as const,
      colorscale: [
        [0, 'rgba(44,78,120,0.45)'],
        [1, 'rgba(18,28,44,0.55)'],
      ],
      contours: { x: { show: false }, y: { show: false }, z: { show: false } },
      lighting: { ambient: 0.9, diffuse: 0.45, specular: 0.1 },
      showlegend: false,
    },

    // Radial lines
    {
      type: 'scatter3d' as const,
      mode: 'lines' as const,
      hoverinfo: 'skip' as const,
      x: radialData.x,
      y: radialData.y,
      z: radialData.z,
      line: { color: SPOKE, width: 2 },
      showlegend: false,
    },

    // Equator ring
    {
      type: 'scatter3d' as const,
      mode: 'lines' as const,
      hoverinfo: 'skip' as const,
      x: equatorRing.x,
      y: equatorRing.y,
      z: equatorRing.z,
      line: { color: RING, width: 2 },
      showlegend: false,
    },

    // Meridian ring
    {
      type: 'scatter3d' as const,
      mode: 'lines' as const,
      hoverinfo: 'skip' as const,
      x: meridianRing.x,
      y: meridianRing.y,
      z: meridianRing.z,
      line: { color: RING, width: 1.5, dash: 'dot' },
      showlegend: false,
    },

    // State points
    {
      type: 'scatter3d' as const,
      mode: 'markers+text',
      x,
      y,
      z,
      text: labelText,
      hoverinfo: 'text' as const,
      hovertext: hoverText,
      textposition: 'top center',
      textfont: { color: '#ffffff', size: 12 },
      marker: {
        size: sizes,
        color: phases,
        colorscale: 'HSV',
        cmin: -Math.PI,
        cmax: Math.PI,
        opacity: 0.95,
        line: { color: '#cfd8ff', width: 1.5 },
      },
      showlegend: false,
    },
  ];

  const layout = {
    uirevision: 'qsphere-view',
    scene: {
      xaxis: hiddenAxisStyle,
      yaxis: hiddenAxisStyle,
      zaxis: hiddenAxisStyle,
      aspectmode: 'cube' as const,
      bgcolor: BG,
      camera,
    },
    margin: { l: 0, r: 0, t: 10, b: 0 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: 'IBM Plex Sans, sans-serif',
      size: 12,
      color: 'rgba(255,255,255,0.85)',
    },
    showlegend: false,
  };

  const config = {
    displayModeBar: false,
    scrollZoom: true,
    responsive: true,
    displaylogo: false,
  };

  return (
    <div className={`qsphere-view ${className}`.trim()}>
      <div className="qsphere-view__controls">
        <div className="qsphere-view__toggles">
          <label className="qsphere-view__checkbox">
            <input
              type="checkbox"
              checked={showStateLabels}
              onChange={(e) => setShowStateLabels(e.target.checked)}
            />
            <span>State labels</span>
          </label>
          <label className="qsphere-view__checkbox">
            <input
              type="checkbox"
              checked={showPhaseLabels}
              onChange={(e) => setShowPhaseLabels(e.target.checked)}
            />
            <span>Phase angle</span>
          </label>
        </div>
        <button
          className="qsphere-view__reset-btn"
          onClick={() => setCamera({ ...DEFAULT_CAMERA })}
        >
          Reset view
        </button>
      </div>
      <div className="qsphere-view__plot">
        <Plot
          ref={plotRef}
          data={traces as Plotly.Data[]}
          layout={layout}
          config={config}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
