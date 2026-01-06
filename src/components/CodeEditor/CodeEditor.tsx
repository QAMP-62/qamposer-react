import { useRef, useEffect, useCallback } from 'react';
import { useQamposer } from '../../hooks/useQamposer';
import './CodeEditor.scss';

// Simple code icon SVG
const CodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 32 32" fill="currentColor">
    <path d="M11.854 8.854L8.707 12l3.147 3.146-1.414 1.415L5.293 12l5.147-5.146z" />
    <path d="M20.146 8.854l3.147 3.146-3.147 3.146 1.414 1.415L26.707 12l-5.147-5.146z" />
    <path d="M13.16 20.42l4-12 1.68.56-4 12z" />
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
