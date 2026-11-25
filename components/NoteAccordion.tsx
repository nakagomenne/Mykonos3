// ============================================================
// ノートの画面で、開閉する部分の動きをそろえるための部品
//   - NoteAccordion: 中身の高さをなめらかに変えて開閉する(アコーディオン)
//   - AccordionArrow: 開閉の向きを示す三角(フォルダ欄の ◀▶ と同じ形)。
//       開くときも閉じるときも、先に中身が伸び縮みして、そのあとで180度まわる
// ============================================================
import React, { useEffect, useState } from 'react';

/** 中身が伸び縮みする時間 / 三角がまわる時間(ミリ秒) */
export const ACCORDION_SLIDE_MS = 220;
export const ACCORDION_SPIN_MS = 300;

interface NoteAccordionProps {
  open: boolean;
  /** 上の要素とのすき間(px)。閉じているあいだは、すき間ごと無くなる */
  gap?: number;
  children: React.ReactNode;
}

/**
 * 開閉する枠。閉じきったら中身を画面から外す(見えない入力欄に移動しないように)。
 * 開ききったあとは、中のメニューなどが枠の外にはみ出せるようにする
 */
export const NoteAccordion: React.FC<NoteAccordionProps> = ({ open, gap = 0, children }) => {
  /** 中身を画面に置いているか(閉じる動きが終わるまでは置いておく) */
  const [mounted, setMounted] = useState(open);
  /** 高さを広げているか */
  const [expanded, setExpanded] = useState(open);
  /** 開ききったか(はみ出しを許す) */
  const [settled, setSettled] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // 高さ0の状態を一度描いてから広げる(いきなり広げると、動きが出ない)
      const t1 = window.setTimeout(() => setExpanded(true), 20);
      const t2 = window.setTimeout(() => setSettled(true), 20 + ACCORDION_SLIDE_MS + 30);
      return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    }
    setSettled(false);
    setExpanded(false);
    const t = window.setTimeout(() => setMounted(false), ACCORDION_SLIDE_MS + 40);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  const shown = open && expanded;
  return (
    <div
      data-note-accordion={shown ? 'open' : 'closed'}
      aria-hidden={!open}
      {...(open ? {} : { inert: true })}
      className="note-accordion"
      style={{ display: 'grid', gridTemplateRows: shown ? '1fr' : '0fr', transition: `grid-template-rows ${ACCORDION_SLIDE_MS}ms ease`, marginTop: 0 }}
    >
      <div style={{ overflow: shown && settled ? 'visible' : 'hidden', minHeight: 0 }}>
        <div style={gap ? { paddingTop: gap } : undefined}>{children}</div>
      </div>
    </div>
  );
};

/** 開閉の向きを示す三角。閉じているときは下向き(▼)、開くと180度まわって上向きになる */
export const AccordionArrow: React.FC<{ open: boolean; size?: number; className?: string }> = ({ open, size = 10, className = '' }) => (
  <svg
    viewBox="0 0 10 10" width={size} height={size} aria-hidden="true"
    className={`note-outline-arrow flex-shrink-0 ${className}`}
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: `transform ${ACCORDION_SPIN_MS}ms ease-out ${ACCORDION_SLIDE_MS}ms` }}
  >
    <path d="M1 2 L9 2 L5 8 Z" fill="currentColor" />
  </svg>
);
