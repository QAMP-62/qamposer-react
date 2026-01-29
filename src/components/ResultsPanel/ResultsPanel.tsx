import Plot from 'react-plotly.js';
import { useQamposer } from '../../hooks/useQamposer';
import './ResultsPanel.scss';

export interface ResultsPanelProps {
  /** Additional CSS class */
  className?: string;
}

export function ResultsPanel({ className = '' }: ResultsPanelProps = {}) {
  const { result } = useQamposer();

  if (!result) {
    return (
      <div className={`results-panel results-panel--empty ${className}`.trim()}>
        <div className="results-panel__placeholder">
          <ChartIcon />
          <h3>No simulation results yet</h3>
          <p>Add gates to your circuit and run simulation to see results</p>
        </div>
      </div>
    );
  }

  // Determine number of qubits from the result
  const maxBinaryLength = Math.max(...Object.keys(result.counts).map((s) => s.length));
  const numQubits = maxBinaryLength;

  // Generate all possible binary states
  const allStates = [];
  for (let i = 0; i < Math.pow(2, numQubits); i++) {
    allStates.push(i.toString(2).padStart(numQubits, '0'));
  }

  // Map counts to all possible states
  const counts = allStates.map((state) => result.counts[state] || 0);
  const totalShots = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
  const probabilities = counts.map((count) => (count / totalShots) * 100);

  const chartHeight = 400;
  const xPositions = allStates.map((_, i) => i);
  const barWidth = 0.6;

  return (
    <div className={`results-panel ${className}`.trim()}>
      <div className="results-panel__header">
        <h3>Simulation Results</h3>
        <div className="results-panel__stats">
          <div className="results-panel__stat">
            <TimeIcon />
            <span>{result.execution_time.toFixed(3)}s</span>
          </div>
        </div>
      </div>

      <div className="results-panel__content">
        <div className="results-panel__chart">
          <Plot
            data={[
              {
                x: xPositions,
                y: probabilities,
                type: 'bar',
                width: barWidth,
                marker: {
                  color: '#4285F4',
                },
              },
            ]}
            layout={{
              title: { text: 'Measurement Probabilities' },
              height: chartHeight,
              xaxis: {
                title: { text: 'Computational basis states' },
                tickmode: 'array',
                tickvals: xPositions,
                ticktext: allStates,
                tickangle: -65,
              },
              yaxis: {
                title: { text: 'Probabilities (%)' },
                range: [0, 100],
                dtick: 20,
              },
              margin: { t: 40, r: 20, b: 100, l: 60 },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: {
                family: 'IBM Plex Sans, sans-serif',
                size: 12,
              },
            }}
            config={{
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
              responsive: true,
            }}
            style={{ width: '100%', height: `${chartHeight}px` }}
            useResizeHandler={true}
          />
        </div>
      </div>
    </div>
  );
}

function ChartIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 32 32" fill="currentColor">
      <path d="M27 28V6h-8v22h-4V14H7v14H4V2H2v26a2 2 0 0 0 2 2h26v-2ZM9 28V16h4v12Zm12 0V8h4v20Z" />
    </svg>
  );
}

function TimeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 32 32" fill="currentColor">
      <path d="M16 4a12 12 0 1 0 12 12A12 12 0 0 0 16 4Zm0 22a10 10 0 1 1 10-10 10 10 0 0 1-10 10Z" />
      <path d="M18.59 21 15 17.41V9h2v7.59l3 3.01L18.59 21z" />
    </svg>
  );
}
