import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QamposerMicro } from '../presets/QamposerMicro';
import { noopAdapter } from '../adapters/noop';

describe('QamposerMicro', () => {
  it('renders with default props', () => {
    const { container } = render(<QamposerMicro adapter={noopAdapter} />);

    expect(container.querySelector('.qamposer-micro')).toBeInTheDocument();
    expect(container.querySelector('.qamposer-micro__header')).toBeInTheDocument();
    expect(container.querySelector('.qamposer-micro__title')).toHaveTextContent('Qamposer');
  });

  it('renders with custom title', () => {
    const { container } = render(<QamposerMicro adapter={noopAdapter} title="My Circuit" />);

    expect(container.querySelector('.qamposer-micro__title')).toHaveTextContent('My Circuit');
  });

  it('hides header when showHeader is false', () => {
    const { container } = render(
      <QamposerMicro adapter={noopAdapter} showHeader={false} />
    );

    expect(container.querySelector('.qamposer-micro__header')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <QamposerMicro adapter={noopAdapter} className="my-custom-class" />
    );

    expect(container.querySelector('.my-custom-class')).toBeInTheDocument();
  });

  it('renders theme toggle by default', () => {
    const { container } = render(<QamposerMicro adapter={noopAdapter} />);

    expect(container.querySelector('.qamposer-micro__theme-toggle')).toBeInTheDocument();
  });

  it('hides theme toggle when showThemeToggle is false', () => {
    const { container } = render(
      <QamposerMicro adapter={noopAdapter} showThemeToggle={false} />
    );

    expect(container.querySelector('.qamposer-micro__theme-toggle')).not.toBeInTheDocument();
  });

  it('accepts a default circuit', () => {
    const circuit = { qubits: 3, gates: [] };
    const { container } = render(
      <QamposerMicro adapter={noopAdapter} defaultCircuit={circuit} />
    );

    expect(container.querySelector('.qamposer-micro')).toBeInTheDocument();
  });

  it('renders in controlled mode without error', () => {
    const onCircuitChange = vi.fn();
    const circuit = { qubits: 2, gates: [] };

    const { container } = render(
      <QamposerMicro
        adapter={noopAdapter}
        circuit={circuit}
        onCircuitChange={onCircuitChange}
      />
    );

    expect(container.querySelector('.qamposer-micro')).toBeInTheDocument();
  });
});
