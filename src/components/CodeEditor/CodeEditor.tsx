import { useRef, useEffect, useCallback } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import './CodeEditor.scss';

// Simple code icon SVG
const CodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.708 5.578L2.061 8.224l2.647 2.646-.708.708L1 8.224l3.354-3.354.354.708zm6.584 0l2.647 2.646-2.647 2.646.708.708L15 8.224l-3.354-3.354-.354.708zM6 13l3-10h1l-3 10H6z" />
  </svg>
);

export interface CodeEditorProps {
  /** Additional CSS class */
  className?: string;
  /** Whether to show the header */
  showHeader?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Read-only mode */
  readOnly?: boolean;
}

export function CodeEditor({
  className = '',
  showHeader = true,
  placeholder = 'Enter OpenQASM 2.0 code...',
  readOnly = false,
}: CodeEditorProps) {
  const { qasmCode, setQasmCode, parseError } = useQamposer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Generate line numbers
  const lineCount = qasmCode.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Handle code change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setQasmCode(e.target.value);
    },
    [setQasmCode]
  );

  // Handle tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newCode = qasmCode.substring(0, start) + '  ' + qasmCode.substring(end);
        setQasmCode(newCode);

        // Restore cursor position after state update
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [qasmCode, setQasmCode]
  );

  // Auto-resize line numbers on code change
  useEffect(() => {
    handleScroll();
  }, [qasmCode, handleScroll]);

  const hasErrors = !!parseError;

  return (
    <div className={`code-editor ${className}`.trim()}>
      {showHeader && (
        <div className="code-editor__header">
          <div className="code-editor__title">
            <CodeIcon />
            <span>Code</span>
          </div>
          <div className="code-editor__format">
            <select disabled defaultValue="openqasm2">
              <option value="openqasm2">OpenQASM 2.0</option>
            </select>
          </div>
        </div>
      )}

      <div className={`code-editor__body ${hasErrors ? 'code-editor__body--error' : ''}`}>
        <div className="code-editor__line-numbers" ref={lineNumbersRef}>
          {lineNumbers.map((num) => (
            <div key={num} className="code-editor__line-number">
              {num}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="code-editor__textarea"
          value={qasmCode}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          readOnly={readOnly}
        />
      </div>

      {parseError && (
        <div className="code-editor__error">
          <span className="code-editor__error-icon">⚠</span>
          <span>{parseError}</span>
        </div>
      )}
    </div>
  );
}
