import React, { useEffect, useId, useRef, useState } from 'react';

export default function EditorMenu({ label, children, disabled = false }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const focusOnOpen = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current) {
      const targets = [...root.current.querySelectorAll('.menu-popover button:not(:disabled), .menu-popover a[href]')];
      targets[focusOnOpen.current === 'last' ? targets.length - 1 : 0]?.focus();
      focusOnOpen.current = null;
    }
    const outside = event => { if (!root.current.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); setOpen(false);
        trigger.current.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const items = () => [...root.current.querySelectorAll('.menu-popover button:not(:disabled), .menu-popover a[href]')];
  return <div ref={root} className="editor-menu" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) { focusOnOpen.current = ['ArrowUp', 'End'].includes(event.key) ? 'last' : 'first'; setOpen(true); return; }
    const targets = items(), index = targets.indexOf(document.activeElement);
    const current = index < 0 && event.key === 'ArrowUp' ? 0 : index;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + targets.length) % targets.length;
    targets[next]?.focus();
  }}>
    <button ref={trigger} className="menu-trigger" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{label}</button>
    {open && <div id={id} className="menu-popover" role="group" aria-label={`${label}命令`} onClick={event => {
      if (event.target.closest('[data-menu-command]')) {
        if (root.current.contains(document.activeElement)) trigger.current.focus({ preventScroll: true });
        setOpen(false);
      }
    }}>{children}</div>}
  </div>;
}
