// ============================================================
// ノートの編集履歴: 1つ前の版から変わった文字に色をつける
//   - 本文(HTML)の中の文字だけを見比べる(書式・画像・添付だけの変更は対象外)
//   - 追加・変更された文字を、オレンジ色の背景で囲んだ HTML を返す
//   - 削除された文字は画面に出せないので、文字数だけ数える
// ============================================================

/** ハイライトの色(ユーザーが引くマーカーの初期色(黄色)と見分けられるよう、オレンジにする) */
export const NOTE_DIFF_COLOR = '#fdba74';
const NOTE_DIFF_TEXT_COLOR = '#1e293b';

/** これより大きい組み合わせは、細かい見比べをあきらめて、変わった範囲をまとめて塗る(固まらないように) */
const MAX_CELLS = 6_000_000;
/** 変更にはさまれた、これより短い「変わっていない文字」は、まとめて変更として塗る(細切れを防ぐ) */
const MIN_KEEP = 3;

export interface NoteDiffResult {
  /** 変わった文字に色をつけた本文 */
  html: string;
  /** 追加・変更された文字数(空白を除く) */
  added: number;
  /** 削除された文字数 */
  removed: number;
  /** コードの枠の中にも変更があるか(コードの枠の中は色をつけられない) */
  codeChanged: boolean;
}

const parse = (html: string): Document => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

const textNodesOf = (doc: Document): Text[] => {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
};

/**
 * b のうち、a に無い(追加・変更された)文字に印をつける。
 * 返り値: [b の文字ごとの印, 削除された文字数]
 */
function diffFlags(a: string, b: string): [Uint8Array, number] {
  const flags = new Uint8Array(b.length);
  let p = 0;
  const maxP = Math.min(a.length, b.length);
  while (p < maxP && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  const maxS = maxP - p;
  while (s < maxS && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  const n = a.length - p - s;
  const m = b.length - p - s;
  if (m === 0) return [flags, n];
  if (n === 0 || n * m > MAX_CELLS || n > 65000 || m > 65000) {
    flags.fill(1, p, p + m);
    return [flags, n];
  }
  // いちばん長い「共通の並び」を求めて、それ以外を変更とする
  const w = m + 1;
  const t = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    const ca = a.charCodeAt(p + i);
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = ca === b.charCodeAt(p + j)
        ? t[(i + 1) * w + j + 1] + 1
        : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  const removed = n - t[0];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a.charCodeAt(p + i) === b.charCodeAt(p + j)) { i++; j++; }
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
    else { flags[p + j] = 1; j++; }
  }
  while (j < m) { flags[p + j] = 1; j++; }
  // 変更にはさまれた短い「変わっていない文字」は、まとめて変更にする
  let k = p;
  const end = p + m;
  while (k < end) {
    if (flags[k]) { k++; continue; }
    let e = k;
    while (e < end && !flags[e]) e++;
    if (k > p && e < end && e - k < MIN_KEEP) flags.fill(1, k, e);
    k = e;
  }
  return [flags, removed];
}

/** 1つ前の版(oldHtml)から、この版(newHtml)で追加・変更された文字に色をつける */
export function highlightNoteChanges(oldHtml: string, newHtml: string): NoteDiffResult {
  try {
    const oldText = textNodesOf(parse(oldHtml)).map(n => n.data).join('');
    const doc = parse(newHtml);
    const nodes = textNodesOf(doc);
    const newText = nodes.map(n => n.data).join('');
    const [flags, removed] = diffFlags(oldText, newText);
    // 絵文字などの2つで1文字になる文字を、途中で切らない
    for (let i = 0; i + 1 < newText.length; i++) {
      const c = newText.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && (flags[i] || flags[i + 1])) { flags[i] = 1; flags[i + 1] = 1; }
    }
    let added = 0;
    let codeChanged = false;
    let offset = 0;
    for (const node of nodes) {
      const text = node.data;
      const start = offset;
      offset += text.length;
      let any = false;
      for (let i = 0; i < text.length; i++) if (flags[start + i]) { any = true; break; }
      if (!any) continue;
      // コードの枠の中は、色をつけても表示されないので、変更があったことだけ覚えておく
      if (node.parentElement?.closest('pre')) { codeChanged = true; continue; }
      const frag = doc.createDocumentFragment();
      let i = 0;
      while (i < text.length) {
        const on = flags[start + i];
        let e = i;
        while (e < text.length && flags[start + e] === on) e++;
        const piece = text.slice(i, e);
        if (on && piece.trim()) {
          const span = doc.createElement('span');
          span.setAttribute('style', `background-color: ${NOTE_DIFF_COLOR}; color: ${NOTE_DIFF_TEXT_COLOR}`);
          span.textContent = piece;
          frag.appendChild(span);
          added += piece.replace(/\s/g, '').length;
        } else {
          frag.appendChild(doc.createTextNode(piece));
        }
        i = e;
      }
      node.parentNode?.replaceChild(frag, node);
    }
    return { html: doc.body.innerHTML, added, removed, codeChanged };
  } catch {
    // 見比べに失敗しても、本文はそのまま見られるようにする
    return { html: newHtml, added: 0, removed: 0, codeChanged: false };
  }
}
