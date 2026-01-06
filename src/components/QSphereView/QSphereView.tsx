import { useMemo, useState, useEffect, useRef } from 'react';
import Plot from 'react-plotly.js';
import { useQamposer } from '../../hooks/useQamposer';
import './QSphereView.scss';

const BG = 'rgba(12,16,22,0.96)';
const RING = 'rgba(255,255,255,0.35)';
const SPOKE = 'rgba(80,140,255,0.55)';
const AXIS_COLOR = 'rgba(255,255,255,0.7)';
const GRID_COLOR = 'rgba(255,255,255,0.12)';
const ZERO_COLOR = 'rgba(255,255,255,0.35)';

const DEFAULT_CAMERA = {
  eye: { x: 1.35, y: 1.35, z: 1.05 },
  center: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
};

export interface QSphereViewProps {
  /** Additional CSS class */
  className?: string;
}

export function QSphereView({ className = '' }: QSphereViewProps = {}) {
  const { result } = useQamposer();
  const points = result?.qsphere;

  const [showStateLabels, setShowStateLabels] = useState(true);
  const [showPhaseLabels, setShowPhaseLabels] = useState(false);
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const plotRef = useRef<any>(null);

  useEffect(() => {
    const handleResize = () => {
      if (plotRef.current?.resizeHandler) {
        plotRef.current.resizeHandler();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const formatPhaseFraction = (phase: number) => {
    const pi = Math.PI;
    const normalized = ((phase % (2 * pi)) + 2 * pi) % (2 * pi);
    const frac = normalized / pi;
    const snapped = Math.round(frac * 4) / 4;
    if (snapped === 0) return '0';
    if (snapped === 2) return '2π';
    const numerator = snapped * 4;
    const denom = 4;
    const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
    const g = gcd(Math.abs(numerator), denom);
    const n = numerator / g;
    const d = denom / g;
    if (d === 1) return `${n}π`;
    return `${n}π/${d}`;
  };

  // All useMemo hooks must be called before any early returns
  const labelText = useMemo(
    () =>
      (points || []).map((p) => {
        const parts = [];
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

  const x = points.map((p) => p.x);
  const y = points.map((p) => p.y);
  const z = points.map((p) => p.z);
  const sizes = points.map((p) => 10 + 38 * Math.sqrt(p.probability));
  const phases = points.map((p) => p.phase);

  const hoverText = points.map((p) => {
    const phaseFraction = formatPhaseFraction(p.phase);
    return (
      `<b>State |${p.state}⟩</b>` +
      `<br>Probability: ${p.probability.toFixed(3)}` +
      `<br>Phase angle: ${phaseFraction}`
    );
  });

  // Unit sphere surface
  const resolutionTheta = 48;
  const resolutionPhi = 96;
  const sphereX: number[][] = [];
  const sphereY: number[][] = [];
  const sphereZ: number[][] = [];
  const sphereC: number[][] = [];

  for (let i = 0; i <= resolutionTheta; i++) {
    const theta = (Math.PI * i) / resolutionTheta;
    const rowX: number[] = [];
    const rowY: number[] = [];
    const rowZ: number[] = [];
    const rowC: number[] = [];
    for (let j = 0; j <= resolutionPhi; j++) {
      const phi = (2 * Math.PI * j) / resolutionPhi;
      rowX.push(Math.sin(theta) * Math.cos(phi));
      rowY.push(Math.sin(theta) * Math.sin(phi));
      rowZ.push(Math.cos(theta));
      rowC.push(1 - Math.abs(Math.cos(theta)) * 0.35);
    }
    sphereX.push(rowX);
    sphereY.push(rowY);
    sphereZ.push(rowZ);
    sphereC.push(rowC);
  }

  const surfaceTrace: any = {
    type: 'surface',
    x: sphereX,
    y: sphereY,
    z: sphereZ,
    surfacecolor: sphereC,
    showscale: false,
    opacity: 0.32,
    hoverinfo: 'skip',
    colorscale: [
      [0, 'rgba(44,78,120,0.45)'],
      [1, 'rgba(18,28,44,0.55)'],
    ],
    contours: { x: { show: false }, y: { show: false }, z: { show: false } },
    lighting: { ambient: 0.9, diffuse: 0.45, specular: 0.1 },
    showlegend: false,
  };

  // Ring traces
  const buildCircle = (theta: number, isMeridian = false) => {
    const ringX: number[] = [];
    const ringY: number[] = [];
    const ringZ: number[] = [];
    for (let j = 0; j <= resolutionPhi; j++) {
      const phi = (2 * Math.PI * j) / resolutionPhi;
      if (isMeridian) {
        ringX.push(Math.sin(phi) * Math.sin(theta));
        ringY.push(Math.cos(phi) * Math.sin(theta));
        ringZ.push(Math.cos(theta));
      } else {
        ringX.push(Math.sin(theta) * Math.cos(phi));
        ringY.push(Math.sin(theta) * Math.sin(phi));
        ringZ.push(Math.cos(theta));
      }
    }
    return { ringX, ringY, ringZ };
  };

  const ringTraces: any[] = [];
  const { ringX: eqX, ringY: eqY, ringZ: eqZ } = buildCircle(Math.PI / 2);
  ringTraces.push({
    type: 'scatter3d',
    mode: 'lines',
    hoverinfo: 'skip',
    x: eqX,
    y: eqY,
    z: eqZ,
    line: { color: RING, width: 2 },
    showlegend: false,
  });

  const { ringX: merX, ringY: merY, ringZ: merZ } = buildCircle(0, true);
  ringTraces.push({
    type: 'scatter3d',
    mode: 'lines',
    hoverinfo: 'skip',
    x: merX,
    y: merY,
    z: merZ,
    line: { color: RING, width: 1.5, dash: 'dot' },
    showlegend: false,
  });

  // Radial lines
  const radialX: (number | null)[] = [];
  const radialY: (number | null)[] = [];
  const radialZ: (number | null)[] = [];
  points.forEach((p) => {
    radialX.push(0, p.x, null);
    radialY.push(0, p.y, null);
    radialZ.push(0, p.z, null);
  });

  const radialTrace: any = {
    type: 'scatter3d',
    mode: 'lines',
    hoverinfo: 'skip',
    x: radialX,
    y: radialY,
    z: radialZ,
    line: { color: SPOKE, width: 2 },
    showlegend: false,
  };

  const pointTrace: any = {
    type: 'scatter3d',
    mode: 'markers+text',
    x,
    y,
    z,
    text: labelText,
    hoverinfo: 'text',
    hovertext: hoverText,
    textposition: 'top center',
    textfont: { color: '#ffffff', size: 12 },
    texttemplate: '%{text}',
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
  };

  const axisStyle = {
    range: [-1.1, 1.1],
    title: { text: '' },
    backgroundcolor: 'rgba(0,0,0,0)',
    showgrid: true,
    gridcolor: GRID_COLOR,
    gridwidth: 1,
    zeroline: true,
    zerolinecolor: ZERO_COLOR,
    zerolinewidth: 2,
    showline: true,
    linecolor: AXIS_COLOR,
    linewidth: 2,
    tickfont: { color: AXIS_COLOR, size: 10 },
    tickcolor: AXIS_COLOR,
    ticklen: 4,
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
          data={[surfaceTrace, radialTrace, ...ringTraces, pointTrace]}
          layout={{
            uirevision: 'qsphere-view',
            scene: {
              xaxis: axisStyle,
              yaxis: axisStyle,
              zaxis: axisStyle,
              aspectmode: 'cube',
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
          }}
          config={{
            displayModeBar: false,
            scrollZoom: true,
            responsive: true,
            displaylogo: false,
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
