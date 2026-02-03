<h1 align="center">
  Qamposer
</h1>

Qamposer is a modular, open-source quantum composer that can be embedded into your applications and runs anywhere.

## Installation

```bash
npm install @qamposer/react
```

For the full version with visualization (Q-sphere, histograms), also install Plotly:

```bash
npm install plotly.js-basic-dist-min react-plotly.js
```

## Examples

### Educational Platform

**Suitable for quantum education in schools and companies.**

An interactive quantum computing tutorial with step-by-step guidance.

![Education Example](./docs/gif/education.gif)

### Gaming Application

**Quantum Circuit as a Controller.**

Quantum mechanics and simulation results can be directly leveraged as game logic.

![Gaming Example](./docs/gif/gaming.gif)

## Quick Start

### Basic Usage (QamposerMicro)

```tsx
import { QamposerMicro } from '@qamposer/react';

function App() {
  return <QamposerMicro />;
}
```

> **Note**: By default, QamposerMicro runs in editor-only mode (no simulation). To enable simulation, see [With Backend](#with-backend-simulation) below.

### Full Version with Visualization (Qamposer)

The full version includes visualization components (histograms, Q-sphere) that require simulation results, so a backend adapter is needed:

```tsx
import { Qamposer } from '@qamposer/react/visualization';
import { qiskitAdapter } from '@qamposer/react';

function App() {
  return (
    <Qamposer
      adapter={qiskitAdapter('http://localhost:8080')}
      defaultTheme="dark"
      showThemeToggle
    />
  );
}
```

## Qamposer vs QamposerMicro

This library provides two preset components to fit different use cases:

| Feature              | Qamposer            | QamposerMicro               |
| -------------------- | ------------------- | --------------------------- |
| Circuit Editor       | Yes                 | Yes                         |
| Gate Library         | Yes                 | Yes                         |
| OpenQASM Code Editor | Yes                 | No                          |
| Results Histogram    | Yes                 | No                          |
| Q-Sphere (3D)        | Yes                 | No                          |
| Plotly.js Required   | Yes                 | **No**                      |
| Bundle Size          | Larger              | **Minimal**                 |
| Best For             | Full IDE experience | Embedded widgets, tutorials |

### When to use Qamposer

- Building a full-featured quantum circuit IDE
- Need visualization of simulation results (histograms, Q-sphere)
- Educational platforms where visualization is important

### When to use QamposerMicro

- Embedding in existing applications
- Tutorials and interactive documentation
- Games and lightweight applications
- When bundle size matters (no Plotly.js dependency)

## Backend Requirements

The React components work standalone for circuit editing. To run quantum simulations, you need the `qamposer-backend` server.

### Editor-Only Mode

By default, components run in editor-only mode without requiring a backend:

```tsx
import { QamposerMicro } from '@qamposer/react';

// No backend required - editor-only mode (default)
<QamposerMicro />;
```

### With Backend (Simulation)

To enable quantum simulation, start the backend and pass the `qiskitAdapter`:

Assuming localhost is used here, but please specify the actual deployment destination for the backend.

```bash
# Clone and setup qamposer-backend
cd qamposer-backend
poetry install
poetry run uvicorn backend.main:app --host 0.0.0.0 --port 8080 --reload
```

```tsx
import { QamposerMicro, qiskitAdapter } from '@qamposer/react';

<QamposerMicro
  adapter={qiskitAdapter('http://localhost:8080')}
  onSimulationComplete={(event) => {
    console.log('Result:', event.result);
    console.log('QASM:', event.qasm);
  }}
/>;
```

## API Reference

### Qamposer Props

```tsx
interface QamposerProps {
  // Circuit State
  circuit?: Circuit; // Controlled mode
  defaultCircuit?: Circuit; // Initial circuit
  onCircuitChange?: (circuit: Circuit) => void;

  // Simulation
  adapter?: SimulationAdapter; // Backend adapter (default: noopAdapter)
  onSimulationComplete?: (event: SimulationCompleteEvent) => void;

  // Configuration
  config?: QamposerConfig;

  // UI Customization
  className?: string;
  showHeader?: boolean; // Default: true
  title?: string; // Default: 'Qamposer'
  defaultTheme?: 'light' | 'dark'; // Default: 'dark'
  showThemeToggle?: boolean; // Default: true

  // Layout (Qamposer only)
  codeEditorWidth?: string; // Default: '280px'
  topGridTemplate?: string; // Default: '1fr 3fr'
  bottomGridTemplate?: string; // Default: '1fr 1fr'
}
```

### QamposerConfig

```tsx
interface QamposerConfig {
  maxQubits?: number; // Default: 5
  maxGates?: number; // Default: 500
  maxShots?: number; // Default: 10000
}
```

<!-- ### Adapters

```tsx
// Qiskit Backend Adapter
import { qiskitAdapter } from '@qamposer/react';

const adapter = qiskitAdapter('http://localhost:8000');

// With options
const adapter = qiskitAdapter({
  baseUrl: 'http://localhost:8000',
  headers: { Authorization: 'Bearer token' },
  timeout: 30000,
});

// No-op Adapter (editor only, no simulation)
import { noopAdapter } from '@qamposer/react';
``` -->

<!-- ### useQamposer Hook

For building custom UIs, use the `useQamposer` hook within a `QamposerProvider`:

```tsx
import { QamposerProvider, useQamposer, qiskitAdapter } from '@qamposer/react';

function CustomEditor() {
  const {
    circuit,
    result,
    status,
    qasmCode,
    addGate,
    removeGate,
    simulate,
    exportQasm,
  } = useQamposer();

  return (
    // Your custom UI
  );
}

// Editor-only mode (default)
function App() {
  return (
    <QamposerProvider>
      <CustomEditor />
    </QamposerProvider>
  );
}

// With backend simulation
function AppWithSimulation() {
  return (
    <QamposerProvider adapter={qiskitAdapter('http://localhost:8080')}>
      <CustomEditor />
    </QamposerProvider>
  );
}
``` -->

<!-- ### Individual Components -->

<!-- You can also use components individually:

```tsx
import {
  CircuitEditor,
  Operations,
  CodeEditor,
  SimulationControls,
} from '@qamposer/react';

// Visualization components (require Plotly)
import { QSphereView, ResultsPanel } from '@qamposer/react/visualization';
``` -->

## OpenQASM Utilities

```tsx
import { circuitToQasm, qasmToCircuit } from '@qamposer/react';

// Convert Circuit to OpenQASM
const qasm = circuitToQasm(circuit);

// Parse OpenQASM to Circuit
const result = qasmToCircuit(qasmCode);
if (result.success) {
  console.log(result.circuit);
} else {
  console.error(result.errors);
}
```

## Supported Gates

| Gate | Description            | Parameters             |
| ---- | ---------------------- | ---------------------- |
| H    | Hadamard               | -                      |
| X    | Pauli-X (NOT)          | -                      |
| Y    | Pauli-Y                | -                      |
| Z    | Pauli-Z                | -                      |
| RX   | Rotation around X-axis | angle (radians)        |
| RY   | Rotation around Y-axis | angle (radians)        |
| RZ   | Rotation around Z-axis | angle (radians)        |
| CNOT | Controlled-NOT         | control, target qubits |

## Theming

The library uses CSS variables for theming. You can customize colors by overriding these variables:

```css
:root {
  --qamposer-bg-primary: #1a1a2e;
  --qamposer-bg-secondary: #16213e;
  --qamposer-text-primary: #ffffff;
  --qamposer-border: #2d3748;
  --qamposer-accent: #4fd1c5;
}
```

Or use the theme hook:

```tsx
import { useTheme } from '@qamposer/react';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}
```

## Peer Dependencies

```json
{
  "react": "^18.0.0 || ^19.0.0",
  "react-dom": "^18.0.0 || ^19.0.0"
}
```

For `Qamposer` (full version) with visualization:

```json
{
  "plotly.js-basic-dist-min": "^2.35.0 || ^3.0.0",
  "react-plotly.js": "^2.6.0"
}
```

## Support & Stability

- This library is under active development.
- Please report issues via [GitHub Issues](https://github.com/QAMP-62/qamposer-react/issues).

## License

Licensed under the Apache 2.0.
