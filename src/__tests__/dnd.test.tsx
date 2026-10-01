import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { QamposerProvider } from '../context/QamposerProvider';
import { CircuitEditor } from '../components/CircuitEditor';
import { Operations } from '../components/Operations';
import { ThemeProvider } from '../context/ThemeContext';
import { TOUCH_ACTIVATION_DELAY } from '../dnd/GateDragContext';
import type { Circuit, CircuitEditEvent } from '../types';

// Layout constants of CircuitEditor: rows are 80px tall; with 32px columns and a
// 20px gap starting at 16px, column n is centred at 32 + 52n.
const rowY = (row: number) => row * 80 + 40;
const columnX = (column: number) => 32 + column * 52;

const BELL: Circuit = {
  qubits: 2,
  gates: [
    { id: 'g1', type: 'H', qubit: 0, position: 0 },
    { id: 'g2', type: 'CNOT', control: 0, target: 1, position: 1 },
  ],
};

function mockLayout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const isCircuit =
      this.classList.contains('circuit-editor__scroll-container') ||
      this.classList.contains('circuit-editor__gates');
    const rect = isCircuit
      ? { left: 0, top: 0, right: 1000, bottom: 300, width: 1000, height: 300 }
      : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    return { ...rect, x: rect.left, y: rect.top, toJSON: () => rect } as DOMRect;
  });
}

function setup(circuit: Circuit = BELL) {
  const onCircuitEdit = vi.fn<(event: CircuitEditEvent) => void>();
  const utils = render(
    <ThemeProvider>
      <QamposerProvider defaultCircuit={circuit} onCircuitEdit={onCircuitEdit}>
        <Operations />
        <CircuitEditor />
      </QamposerProvider>
    </ThemeProvider>
  );
  const paletteGate = (label: string) =>
    Array.from(utils.container.querySelectorAll('.operations__gate')).find(
      (el) => el.textContent === label
    ) as HTMLElement;
  const circuitGate = (label: string) =>
    Array.from(utils.container.querySelectorAll('.circuit-editor__gate')).find(
      (el) => el.textContent === label
    ) as HTMLElement;
  return { ...utils, onCircuitEdit, paletteGate, circuitGate };
}

type PointerInit = { x: number; y: number; type?: 'mouse' | 'touch' };

function down(el: Element, { x, y, type = 'mouse' }: PointerInit) {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: type, button: 0, clientX: x, clientY: y });
}
function move({ x, y, type = 'mouse' }: PointerInit) {
  fireEvent.pointerMove(window, { pointerId: 1, pointerType: type, clientX: x, clientY: y });
}
function up({ x, y, type = 'mouse' }: PointerInit) {
  fireEvent.pointerUp(window, { pointerId: 1, pointerType: type, clientX: x, clientY: y });
}

beforeEach(mockLayout);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // Let the post-drag click suppression expire so it cannot leak into the next test
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe('pointer drag and drop', () => {
  it('inserts a gate dragged from the palette with the mouse', () => {
    const { onCircuitEdit, paletteGate } = setup();

    down(paletteGate('X'), { x: 5, y: 5 });
    move({ x: 20, y: 20 });
    up({ x: columnX(0), y: rowY(1) });

    expect(onCircuitEdit).toHaveBeenCalledTimes(1);
    const event = onCircuitEdit.mock.calls[0][0];
    expect(event).toMatchObject({ action: 'add', origin: 'pointer' });
    expect(event.after.gates.find((g) => g.id === event.gateId)).toMatchObject({
      type: 'X',
      qubit: 1,
      position: 0,
    });
  });

  it('does not start a drag on a mouse press without movement', () => {
    const { onCircuitEdit, paletteGate } = setup();

    down(paletteGate('X'), { x: 5, y: 5 });
    move({ x: 6, y: 6 });
    up({ x: columnX(0), y: rowY(1) });

    expect(onCircuitEdit).not.toHaveBeenCalled();
  });

  it('moves a placed gate and reports it as a move', () => {
    const { onCircuitEdit, circuitGate } = setup();

    down(circuitGate('H'), { x: columnX(0), y: rowY(0) });
    move({ x: columnX(1), y: rowY(1) });
    up({ x: columnX(1), y: rowY(1) });

    expect(onCircuitEdit).toHaveBeenCalledTimes(1);
    expect(onCircuitEdit.mock.calls[0][0]).toMatchObject({
      action: 'move',
      origin: 'pointer',
      gateId: 'g1',
      from: { row: 0, column: 0 },
      to: { row: 1, column: 1 },
    });
  });

  it('previews the move and the displaced gates while dragging', async () => {
    const { container, circuitGate } = setup();

    down(circuitGate('H'), { x: columnX(0), y: rowY(0) });
    move({ x: columnX(1), y: rowY(1) });
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));

    // H is shown at its drop cell; the CNOT slides left as a side effect
    const moving = container.querySelector('.circuit-editor__gate--moving') as HTMLElement;
    expect(moving.textContent).toBe('H');
    expect(moving.style.top).toBe(`${rowY(1)}px`);
    expect(container.querySelector('.circuit-editor__cnot--shifted-preview')).not.toBeNull();

    up({ x: 5000, y: 5000 });
    expect(container.querySelector('.circuit-editor__gate--moving')).toBeNull();
  });

  it('cancels when dropped outside the circuit', () => {
    const { onCircuitEdit, circuitGate } = setup();

    down(circuitGate('H'), { x: columnX(0), y: rowY(0) });
    move({ x: columnX(3), y: rowY(1) });
    up({ x: 5000, y: 5000 });

    expect(onCircuitEdit).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const { onCircuitEdit, circuitGate } = setup();

    down(circuitGate('H'), { x: columnX(0), y: rowY(0) });
    move({ x: columnX(3), y: rowY(1) });
    fireEvent.keyDown(window, { key: 'Escape' });
    up({ x: columnX(3), y: rowY(1) });

    expect(onCircuitEdit).not.toHaveBeenCalled();
  });

  it('swallows the click that follows a drag', async () => {
    const { container, circuitGate } = setup();

    down(circuitGate('H'), { x: columnX(0), y: rowY(0) });
    move({ x: columnX(0), y: rowY(1) });
    up({ x: columnX(0), y: rowY(1) });
    fireEvent.click(circuitGate('H'));
    expect(container.querySelector('.circuit-editor__toolbar')).toBeNull();

    // Later clicks select the gate as usual
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.click(circuitGate('H'));
    expect(container.querySelector('.circuit-editor__toolbar')).not.toBeNull();
  });
});

describe('touch drag and drop', () => {
  it('starts a drag after a long-press and shows the ghost', () => {
    vi.useFakeTimers();
    const { onCircuitEdit, paletteGate } = setup();

    down(paletteGate('Z'), { x: 5, y: 5, type: 'touch' });
    act(() => vi.advanceTimersByTime(TOUCH_ACTIVATION_DELAY));
    expect(document.querySelector('.qamposer-drag-ghost')).not.toBeNull();

    move({ x: columnX(0), y: rowY(1), type: 'touch' });
    up({ x: columnX(0), y: rowY(1), type: 'touch' });

    expect(onCircuitEdit).toHaveBeenCalledTimes(1);
    expect(onCircuitEdit.mock.calls[0][0]).toMatchObject({ action: 'add', origin: 'pointer' });
    expect(document.querySelector('.qamposer-drag-ghost')).toBeNull();
  });

  it('lets the page scroll when the finger moves before the long-press', () => {
    vi.useFakeTimers();
    const { onCircuitEdit, paletteGate } = setup();

    down(paletteGate('Z'), { x: 5, y: 5, type: 'touch' });
    move({ x: 5, y: 40, type: 'touch' });
    act(() => vi.advanceTimersByTime(TOUCH_ACTIVATION_DELAY));
    expect(document.querySelector('.qamposer-drag-ghost')).toBeNull();

    up({ x: columnX(0), y: rowY(1), type: 'touch' });
    expect(onCircuitEdit).not.toHaveBeenCalled();
  });

  it('blocks page scrolling while dragging', () => {
    vi.useFakeTimers();
    const { circuitGate } = setup();

    down(circuitGate('H'), { x: columnX(0), y: rowY(0), type: 'touch' });
    act(() => vi.advanceTimersByTime(TOUCH_ACTIVATION_DELAY));

    const touchMove = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(touchMove);
    expect(touchMove.defaultPrevented).toBe(true);

    up({ x: 5000, y: 5000, type: 'touch' });
    const afterDrag = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(afterDrag);
    expect(afterDrag.defaultPrevented).toBe(false);
  });
});

describe('keyboard moves and shared history', () => {
  it('moves a placed gate with Space, arrows and Space', () => {
    const { container, onCircuitEdit } = setup();
    const grid = container.querySelector('.circuit-editor__scroll-container')!;

    // Cursor starts on the H gate at q0, column 0
    fireEvent.keyDown(grid, { key: ' ' });
    fireEvent.keyUp(grid, { key: ' ' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyUp(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyUp(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: ' ' });
    fireEvent.keyUp(grid, { key: ' ' });

    expect(onCircuitEdit).toHaveBeenCalledTimes(1);
    expect(onCircuitEdit.mock.calls[0][0]).toMatchObject({
      action: 'move',
      origin: 'keyboard',
      gateId: 'g1',
      to: { row: 1, column: 1 },
    });
  });

  it('undoes a pointer edit from the keyboard', () => {
    const { container, onCircuitEdit, paletteGate } = setup();
    const grid = container.querySelector('.circuit-editor__scroll-container')!;

    down(paletteGate('X'), { x: 5, y: 5 });
    move({ x: 20, y: 20 });
    up({ x: columnX(0), y: rowY(1) });
    expect(onCircuitEdit.mock.lastCall![0].after.gates).toHaveLength(3);

    fireEvent.keyDown(grid, { key: 'z', ctrlKey: true });

    expect(onCircuitEdit.mock.lastCall![0]).toMatchObject({ action: 'undo', origin: 'keyboard' });
    expect(onCircuitEdit.mock.lastCall![0].after).toEqual(BELL);
  });
});

describe('gate editor', () => {
  const ROTATION: Circuit = {
    qubits: 2,
    gates: [{ id: 'r', type: 'RX', qubit: 0, position: 0, parameter: Math.PI / 2 }],
  };

  function openEditor(container: HTMLElement, label: string) {
    const gate = Array.from(container.querySelectorAll('.circuit-editor__gate')).find((el) =>
      el.textContent?.startsWith(label)
    ) as HTMLElement;
    fireEvent.click(gate);
    fireEvent.click(container.querySelector('[title="Edit operation"]')!);
  }

  it('reports parameter changes as pointer edits', () => {
    const { container, onCircuitEdit } = setup(ROTATION);
    openEditor(container, 'RX');

    const input = container.querySelector('#theta-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pi' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCircuitEdit).toHaveBeenCalledTimes(1);
    expect(onCircuitEdit.mock.calls[0][0]).toMatchObject({
      action: 'update',
      origin: 'pointer',
      gateId: 'r',
    });
    expect(onCircuitEdit.mock.calls[0][0].after.gates[0].parameter).toBeCloseTo(Math.PI);
  });

  it('reports CNOT changes as pointer edits', () => {
    const { container, onCircuitEdit } = setup({
      qubits: 3,
      gates: [{ id: 'c', type: 'CNOT', control: 0, target: 1, position: 0 }],
    });
    fireEvent.click(container.querySelector('.circuit-editor__cnot')!);
    fireEvent.click(container.querySelector('[title="Edit operation"]')!);

    fireEvent.change(container.querySelector('#target-select')!, { target: { value: '2' } });
    fireEvent.click(container.querySelector('.operations__apply-btn')!);

    expect(onCircuitEdit.mock.calls[0][0]).toMatchObject({
      action: 'update',
      origin: 'pointer',
      gateId: 'c',
    });
  });

  it('keeps an exact angle that is displayed rounded when the field is only focused', () => {
    const exact: Circuit = {
      qubits: 1,
      gates: [{ id: 'r', type: 'RZ', qubit: 0, position: 0, parameter: 1.23456789 }],
    };
    const { container, onCircuitEdit } = setup(exact);
    openEditor(container, 'RZ');

    const input = container.querySelector('#theta-input') as HTMLInputElement;
    expect(input.value).toBe('1.2346');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    // Every circuit change emits onCircuitEdit, so no event means the exact angle was kept
    expect(onCircuitEdit).not.toHaveBeenCalled();
  });

  it('saves an edited angle once even when Enter is followed by blur', () => {
    const { container, onCircuitEdit } = setup(ROTATION);
    openEditor(container, 'RX');

    const input = container.querySelector('#theta-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(onCircuitEdit).toHaveBeenCalledTimes(1);
    expect(onCircuitEdit.mock.calls[0][0].after.gates[0].parameter).toBe(1.5);
  });

  it('emits nothing when the editor saves an unchanged value', () => {
    const { container, onCircuitEdit } = setup(ROTATION);
    openEditor(container, 'RX');

    fireEvent.blur(container.querySelector('#theta-input')!);

    expect(onCircuitEdit).not.toHaveBeenCalled();
  });
});
