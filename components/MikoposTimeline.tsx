import React, { useMemo, useRef, useState } from 'react';
import { NoteLinkText, lengthWithoutNoteLinks, noteLinksLength, replaceNoteLinks } from './noteLinks';
import type { User } from '../types';
import type { MikoposApi } from '../hooks/useMikopos';
import type { MikoposPost } from '../services/mikoposService';
import { HeartIcon, HeartSolidIcon, SpeechBubbleIcon } from './icons';
import {
  MIKOPOS_BODY_MAX, MIKOPOS_REPLY_MAX, MIKOPOS_POLL_MIN, MIKOPOS_POLL_MAX, MIKOPOS_POLL_OPTION_MAX, MIKOPOS_LIKE,
  extractMentions, uploadMikoposImage,
} from '../services/mikoposService';

interface MikoposTimelineProps {
  api: MikoposApi;
  me: User;
  users: User[];
  isDarkMode?: boolean;
  /** 名前やアイコンを押したとき(その人のプロフィールを開く) */
  onOpenProfile: (name: string) => void;
  /** 自分の一番新しいポストが変わったとき(プロフィールの「ひとこと」に反映する) */
  onLatestBodyChange: (body: string) => void;
  /** 投稿したときの演出(紙飛行機など)。なくてもよい */
  onPosted?: (buttonEl: HTMLElement | null) => void;
  /** いいねを押したとき(アニメーションつきで付け外しする)。なければ、その場で付け外しだけする */
  onLike?: (post: MikoposPost, buttonEl: HTMLElement) => void;
}

const ACCENT = '#a855f7';
const GRADIENT = 'linear-gradient(135deg, #f472b6 0%, #a855f7 50%, #6366f1 100%)';

const fmtWhen = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 本文の中の「@名前」に色をつける */
const renderBody = (body: string, mentions: string[]): React.ReactNode => {
  if (mentions.length === 0) return body;
  const tokens = [...mentions].sort((a, b) => b.length - a.length).map(n => `@${n}`);
  const out: React.ReactNode[] = [];
  let rest = body;
  let key = 0;
  while (rest) {
    let hitAt = -1;
    let hit = '';
    for (const tk of tokens) {
      const i = rest.indexOf(tk);
      if (i >= 0 && (hitAt < 0 || i < hitAt)) { hitAt = i; hit = tk; }
    }
    if (hitAt < 0) { out.push(rest); break; }
    if (hitAt > 0) out.push(rest.slice(0, hitAt));
    out.push(<span key={key++} style={{ color: ACCENT, fontWeight: 700 }}>{hit}</span>);
    rest = rest.slice(hitAt + hit.length);
  }
  return out;
};

const Avatar: React.FC<{ user?: User; name: string; size?: number }> = ({ user, name, size = 34 }) => (
  user?.profilePicture
    ? <img src={user.profilePicture} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <div aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>{name.slice(0, 1)}</div>
);

const MikoposTimeline: React.FC<MikoposTimelineProps> = ({ api, me, users, isDarkMode = false, onOpenProfile, onLatestBodyChange, onPosted, onLike }) => {
  const d = isDarkMode;
  const text = d ? '#e2e8f0' : '#334155';
  const sub = d ? '#94a3b8' : '#64748b';
  const line = d ? 'rgba(148,163,184,0.25)' : '#e2e8f0';
  const cardBg = d ? '#262238' : '#fff';
  const softBg = d ? '#231f36' : '#fdf4ff';
  /** タイムラインの背景: Mikopos のテーマカラーをうすく敷く */
  const timelineBg = d
    ? 'linear-gradient(180deg, #2a1f3d 0%, #221d3a 50%, #1c1d3a 100%)'
    : 'linear-gradient(180deg, #fdf2f8 0%, #f5f3ff 50%, #eef2ff 100%)';
  /** ポストの外枠: テーマカラーのグラデーション(中は白 / 暗い色) */
  const cardFrame: React.CSSProperties = {
    background: `linear-gradient(${cardBg}, ${cardBg}) padding-box, ${GRADIENT} border-box`,
    border: '2px solid transparent',
    boxShadow: d ? '0 2px 10px rgba(0,0,0,0.35)' : '0 2px 10px rgba(168,85,247,0.12)',
  };
  /** 画像ファイルをドラッグしている間、置ける場所だと分かるようにする */
  const [dragOver, setDragOver] = useState(false);
  const inputStyle: React.CSSProperties = { width: '100%', background: d ? '#2a2640' : '#fff', color: text, border: `1px solid ${line}`, borderRadius: 10, padding: '6px 10px', fontSize: 13, outline: 'none' };

  const userByName = useMemo(() => new Map(users.map(u => [u.name, u])), [users]);
  const userNames = useMemo(() => users.map(u => u.name), [users]);

  // ── 投稿欄 ──
  const [body, setBody] = useState('');
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 返信欄(開いているポストと、その入力) ──
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  /** 返信に付ける画像(ドラッグ・貼り付け・ボタンで選ぶ) */
  const [replyImage, setReplyImage] = useState<{ file: File; preview: string } | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);
  /** 画像ファイルを、返信欄を開いているポストの上にドラッグしているか(そのポストのID) */
  const [replyDrag, setReplyDrag] = useState<string | null>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const clearReplyImage = () => {
    if (replyImage) URL.revokeObjectURL(replyImage.preview);
    setReplyImage(null);
  };
  const pickReplyImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('画像ファイル(GIF を含む)を選んでください'); return; }
    setError('');
    clearReplyImage();
    setReplyImage({ file, preview: URL.createObjectURL(file) });
  };
  const [deleteTarget, setDeleteTarget] = useState<MikoposPost | null>(null);

  const remaining = MIKOPOS_BODY_MAX - lengthWithoutNoteLinks(body);
  const validPoll = pollOpen ? pollOptions.map(o => o.trim()).filter(Boolean) : [];
  const pollIncomplete = pollOpen && validPoll.length < MIKOPOS_POLL_MIN;
  const canPost = !busy && remaining >= 0 && !pollIncomplete && (body.trim() !== '' || !!image || validPoll.length >= MIKOPOS_POLL_MIN);

  const clearImage = () => {
    if (image) URL.revokeObjectURL(image.preview);
    setImage(null);
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('画像ファイル(GIF を含む)を選んでください'); return; }
    setError('');
    clearImage();
    setImage({ file, preview: URL.createObjectURL(file) });
  };

  /** カーソルの直前が「@なにか」なら、メンションの候補を出す */
  const updateMentionQuery = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    // 日本語入力のままだと全角の「＠」になるので、半角・全角のどちらでも候補を出す
    const at = Math.max(before.lastIndexOf('@'), before.lastIndexOf('＠'));
    if (at < 0) { setMentionQuery(null); return; }
    const q = before.slice(at + 1);
    if (/\s/.test(q) || q.length > 12) { setMentionQuery(null); return; }
    setMentionQuery(q);
  };

  const mentionCandidates = mentionQuery === null ? [] : users
    .filter(u => u.name !== me.name && !u.isBot && (u.name.includes(mentionQuery) || (u.furigana ?? '').includes(mentionQuery)))
    .slice(0, 30);

  const insertMention = (name: string) => {
    const el = textRef.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    // 日本語入力のままだと全角の「＠」になるので、半角・全角のどちらでも候補を出す
    const at = Math.max(before.lastIndexOf('@'), before.lastIndexOf('＠'));
    if (at < 0) return;
    const next = `${body.slice(0, at)}@${name} ${body.slice(caret)}`;
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = at + name.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const handlePost = async (buttonEl: HTMLElement | null) => {
    if (!canPost) return;
    onPosted?.(buttonEl);
    setBusy(true);
    setError('');
    try {
      // 全角の「＠名前」は、半角の「@名前」にそろえて保存する(メンションとして扱うため)
      let trimmed = body.trim();
      for (const n of userNames) trimmed = trimmed.split(`＠${n}`).join(`@${n}`);
      const imageUrl = image ? await uploadMikoposImage(image.file, me.name) : null;
      await api.post({
        body: trimmed,
        imageUrl,
        pollOptions: validPoll,
        mentions: extractMentions(trimmed, userNames.filter(n => n !== me.name)),
      });
      if (trimmed) onLatestBodyChange(replaceNoteLinks(trimmed));
      setBody('');
      clearImage();
      setPollOpen(false);
      setPollOptions(['', '']);
      setMentionQuery(null);
    } catch (e: any) {
      setError(e?.message ?? '投稿に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (post: MikoposPost) => {
    setDeleteTarget(null);
    setError('');
    try {
      // 消すのが自分の一番新しいポストなら、プロフィールの「ひとこと」をその前のポストに戻す
      const mine = api.posts.filter(p => p.author === me.name);
      const wasLatest = mine[0]?.id === post.id;
      await api.removePost(post.id);
      if (wasLatest) onLatestBodyChange(replaceNoteLinks(mine.find(p => p.id !== post.id && p.body)?.body ?? ''));
    } catch (e: any) {
      setError(e?.message ?? '削除に失敗しました');
    }
  };

  const handleReply = async (postId: string) => {
    const t = replyText.trim();
    if (replyBusy || (!t && !replyImage) || lengthWithoutNoteLinks(t) > MIKOPOS_REPLY_MAX) return;
    setError('');
    setReplyBusy(true);
    try {
      const imageUrl = replyImage ? await uploadMikoposImage(replyImage.file, me.name) : null;
      await api.reply(postId, t, imageUrl);
      setReplyText('');
      clearReplyImage();
    } catch (e: any) {
      setError(e?.message ?? '返信に失敗しました');
    } finally {
      setReplyBusy(false);
    }
  };

  const run = (fn: () => Promise<void>) => { setError(''); fn().catch((e: any) => setError(e?.message ?? '操作に失敗しました')); };

  const smallBtn: React.CSSProperties = { fontSize: 12, padding: '4px 10px', borderRadius: 999, border: `1px solid ${line}`, background: 'transparent', color: sub, cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, color: text, position: 'relative' }}
      onDragOver={e => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setDragOver(false); setReplyDrag(null); } }}
      onDrop={e => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
        e.preventDefault();
        setDragOver(false);
        setReplyDrag(null);
        const files = Array.from(e.dataTransfer.files ?? []);
        const img = files.find(f => f.type.startsWith('image/'));
        if (img) pickImage(img);
        else if (files.length) setError('画像ファイル(GIF を含む)を選んでください');
      }}
    >
      {dragOver && !replyDrag && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 6, zIndex: 15, borderRadius: 16, border: `2px dashed ${ACCENT}`, background: d ? 'rgba(168,85,247,0.22)' : 'rgba(168,85,247,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: 700, fontSize: 14, pointerEvents: 'none' }}>
          ここに画像・GIF を置くと、ポストに付きます
        </div>
      )}
      {/* ── 投稿欄 ── */}
      <div style={{ flexShrink: 0, padding: '12px 14px', borderBottom: `1px solid ${d ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.25)'}`, background: softBg, position: 'relative' }}>
        <textarea
          ref={textRef}
          value={body}
          onChange={e => { setBody(e.target.value); updateMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
          onKeyUp={e => updateMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onKeyDown={e => {
            if (e.key === 'Escape' && mentionQuery !== null) { e.preventDefault(); setMentionQuery(null); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void handlePost(null); }
          }}
          onPaste={e => {
            const f = Array.from(e.clipboardData?.files ?? []).find(x => x.type.startsWith('image/'));
            if (f) { e.preventDefault(); pickImage(f); }
          }}
          rows={2}
          placeholder="いまどうしてる？(@ で名前を呼べます)"
          aria-label="ポストの本文"
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
        />
        {mentionCandidates.length > 0 && (
          <div role="listbox" aria-label="メンションする人" style={{ position: 'absolute', left: 14, right: 14, top: 62, zIndex: 5, background: cardBg, border: `1px solid ${line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto' }}>
            {mentionCandidates.map(u => (
              <button
                key={u.name}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={e => { e.preventDefault(); insertMention(u.name); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'transparent', border: 0, color: text, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
              >
                <Avatar user={u} name={u.name} size={22} /> {u.name}
              </button>
            ))}
          </div>
        )}

        {image && (
          <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
            <img src={image.preview} alt="添付する画像" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 10, border: `1px solid ${line}`, display: 'block' }} />
            <button type="button" onClick={clearImage} aria-label="画像を外す" title="画像を外す" style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        )}

        {pollOpen && (
          <div style={{ marginTop: 8, padding: 8, border: `1px solid ${line}`, borderRadius: 10, background: cardBg }}>
            <div style={{ fontSize: 11, color: sub, marginBottom: 6 }}>投票の選択肢({MIKOPOS_POLL_MIN}〜{MIKOPOS_POLL_MAX}つ)</div>
            {pollOptions.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  value={o}
                  maxLength={MIKOPOS_POLL_OPTION_MAX}
                  onChange={e => setPollOptions(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`選択肢 ${i + 1}`}
                  aria-label={`選択肢 ${i + 1}`}
                  style={inputStyle}
                />
                {pollOptions.length > MIKOPOS_POLL_MIN && (
                  <button type="button" onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))} aria-label={`選択肢 ${i + 1} を消す`} style={{ ...smallBtn, padding: '4px 8px' }}>×</button>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              {pollOptions.length < MIKOPOS_POLL_MAX && (
                <button type="button" onClick={() => setPollOptions(prev => [...prev, ''])} style={smallBtn}>＋ 選択肢を足す</button>
              )}
              <button type="button" onClick={() => { setPollOpen(false); setPollOptions(['', '']); }} style={smallBtn}>投票をやめる</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} title="画像・GIF を付ける(ドラッグや貼り付けでも付けられます)" style={smallBtn}>画像・GIF</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" onClick={() => setPollOpen(o => !o)} disabled={busy} aria-pressed={pollOpen} title="投票(アンケート)を付ける" style={{ ...smallBtn, ...(pollOpen ? { borderColor: ACCENT, color: ACCENT, fontWeight: 700 } : {}) }}>投票</button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: remaining < 0 ? '#ef4444' : remaining <= 20 ? '#f59e0b' : sub }}>{remaining}</span>
          <button
            type="button"
            onClick={e => void handlePost(e.currentTarget)}
            disabled={!canPost}
            style={{ fontSize: 13, fontWeight: 700, padding: '6px 16px', borderRadius: 999, border: 0, color: '#fff', background: GRADIENT, cursor: canPost ? 'pointer' : 'not-allowed', opacity: canPost ? 1 : 0.45 }}
          >{busy ? '送信中…' : 'ポスト'}</button>
        </div>
        {pollIncomplete && <div style={{ fontSize: 11, color: sub, marginTop: 4 }}>投票は、選択肢を2つ以上入れると投稿できます。</div>}
        {error && <div role="alert" style={{ fontSize: 12, color: '#ef4444', marginTop: 6, whiteSpace: 'pre-wrap' }}>{error}</div>}
      </div>

      {/* ── タイムライン ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 12, background: timelineBg }}>
        {api.posts.length === 0 && (
          <div style={{ textAlign: 'center', color: sub, fontSize: 13, padding: '36px 0' }}>まだポストはありません。最初のひとことを書いてみましょう。</div>
        )}
        {api.posts.map(post => {
          const author = userByName.get(post.author);
          const reactions = api.reactions.filter(r => r.postId === post.id);
          const replies = api.replies.filter(r => r.postId === post.id);
          const votes = api.votes.filter(v => v.postId === post.id);
          const myVote = votes.find(v => v.userName === me.name)?.optionIndex;
          const likers = reactions.filter(r => r.emoji === MIKOPOS_LIKE).map(r => r.userName);
          const likedByMe = likers.includes(me.name);
          const pill: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', background: d ? '#2a2440' : '#f1f5f9', color: d ? '#94a3b8' : '#64748b', border: '1px solid transparent' };
          const isMine = post.author === me.name;
          return (
            <article
              key={post.id}
              data-mikopos-post={post.id}
              style={{ ...cardFrame, borderRadius: 16, padding: '10px 12px', position: 'relative' }}
              {...(replyOpen === post.id ? {
                onDragOver: (e: React.DragEvent) => {
                  if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'copy';
                  if (replyDrag !== post.id) setReplyDrag(post.id);
                },
                onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setReplyDrag(null); },
                onDrop: (e: React.DragEvent) => {
                  if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  setReplyDrag(null);
                  const files = Array.from(e.dataTransfer.files ?? []);
                  const img = files.find(f => f.type.startsWith('image/'));
                  if (img) pickReplyImage(img);
                  else if (files.length) setError('画像ファイル(GIF を含む)を選んでください');
                },
              } : {})}
            >
              {replyDrag === post.id && (
                <div aria-hidden="true" data-mikopos-reply-drop style={{ position: 'absolute', inset: 2, zIndex: 4, borderRadius: 14, border: `2px dashed ${ACCENT}`, background: d ? 'rgba(168,85,247,0.28)' : 'rgba(168,85,247,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontWeight: 700, fontSize: 13, pointerEvents: 'none', textAlign: 'center', padding: 8 }}>
                  ここに画像・GIF を置くと、返信に付きます
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => onOpenProfile(post.author)} title={`${post.author} さんのプロフィールを開く`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 0, padding: 0, color: text, cursor: 'pointer', minWidth: 0 }}>
                  <Avatar user={author} name={post.author} />
                  <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.author}</span>
                </button>
                <span style={{ fontSize: 11, color: sub, whiteSpace: 'nowrap' }} title={new Date(post.createdAt).toLocaleString('ja-JP')}>{fmtWhen(post.createdAt)}</span>
                {isMine && (
                  <button type="button" onClick={() => setDeleteTarget(post)} title="このポストを削除" style={{ ...smallBtn, marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }}>削除</button>
                )}
              </div>

              {post.body && <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><NoteLinkText text={post.body} renderText={part => renderBody(part, post.mentions)} /></p>}

              {post.imageUrl && (
                <a href={post.imageUrl} target="_blank" rel="noopener noreferrer" title="画像を大きく開く" style={{ display: 'block', marginTop: 8 }}>
                  <img src={post.imageUrl} alt="添付画像" loading="lazy" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: `1px solid ${line}`, display: 'block' }} />
                </a>
              )}

              {post.poll && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {post.poll.options.map((opt, i) => {
                    const count = votes.filter(v => v.optionIndex === i).length;
                    const pct = votes.length ? Math.round((count / votes.length) * 100) : 0;
                    const chosen = myVote === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => run(() => api.vote(post.id, i))}
                        aria-pressed={chosen}
                        title={chosen ? 'あなたが選んでいる選択肢です' : 'この選択肢に投票する(あとから選び直せます)'}
                        style={{ position: 'relative', overflow: 'hidden', textAlign: 'left', padding: '6px 10px', borderRadius: 10, border: `1px solid ${chosen ? ACCENT : line}`, background: 'transparent', color: text, cursor: 'pointer', fontSize: 13 }}
                      >
                        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: chosen ? 'rgba(168,85,247,0.22)' : (d ? 'rgba(148,163,184,0.16)' : 'rgba(100,116,139,0.12)'), transition: 'width 0.3s' }} />
                        <span style={{ position: 'relative', display: 'flex', gap: 8 }}>
                          <span style={{ flex: 1, fontWeight: chosen ? 700 : 400 }}>{chosen ? '✓ ' : ''}{opt}</span>
                          <span style={{ color: sub, fontSize: 12 }}>{count}票 ({pct}%)</span>
                        </span>
                      </button>
                    );
                  })}
                  <div style={{ fontSize: 11, color: sub }}>{votes.length}人が投票{myVote === undefined ? '(押すと投票できます)' : ''}</div>
                </div>
              )}

              {/* いいねと返信(今までの Mikopos と同じ見た目) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={e => (onLike ? onLike(post, e.currentTarget) : run(() => api.toggleReaction(post.id, MIKOPOS_LIKE)))}
                  aria-pressed={likedByMe}
                  aria-label="いいね"
                  title={likers.length > 0 ? likers.join(', ') : 'いいね'}
                  style={{ ...pill, ...(likedByMe ? { background: '#fff0f3', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.25)' } : {}) }}
                >
                  {likedByMe ? <HeartSolidIcon className="w-3.5 h-3.5" /> : <HeartIcon className="w-3.5 h-3.5" />}
                  {likers.length > 0 && likers.length}
                </button>
                <button
                  type="button"
                  onClick={() => { setReplyOpen(o => (o === post.id ? null : post.id)); setReplyText(''); clearReplyImage(); }}
                  aria-expanded={replyOpen === post.id}
                  style={pill}
                >
                  <SpeechBubbleIcon className="w-3.5 h-3.5" />
                  返信{replies.length > 0 && <span style={{ fontWeight: 700, marginLeft: 2 }}>{replies.length}</span>}
                </button>
              </div>

              {(replies.length > 0 || replyOpen === post.id) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${line}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {replies.map(r => (
                    <div key={r.id} style={{ display: 'flex', gap: 6, fontSize: 12.5, lineHeight: 1.5 }}>
                      <Avatar user={userByName.get(r.author)} name={r.author} size={20} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700 }}>{r.author}</span>
                        <span style={{ color: sub, fontSize: 11, marginLeft: 6 }}>{fmtWhen(r.createdAt)}</span>
                        {r.body && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><NoteLinkText text={r.body} /></div>}
                        {r.imageUrl && (
                          <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" title="画像を大きく開く" style={{ display: 'block', marginTop: 4 }}>
                            <img src={r.imageUrl} alt="返信の画像" loading="lazy" data-mikopos-reply-image style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, border: `1px solid ${line}`, display: 'block' }} />
                          </a>
                        )}
                      </div>
                      {r.author === me.name && (
                        <button type="button" onClick={() => run(() => api.removeReply(r.id))} aria-label="この返信を削除" title="この返信を削除" style={{ ...smallBtn, padding: '0 6px', fontSize: 11, alignSelf: 'flex-start' }}>×</button>
                      )}
                    </div>
                  ))}
                  {replyOpen === post.id && replyImage && (
                    <div style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start' }}>
                      <img src={replyImage.preview} alt="返信に付ける画像" data-mikopos-reply-preview style={{ maxHeight: 90, maxWidth: '100%', borderRadius: 8, border: `1px solid ${line}`, display: 'block' }} />
                      <button type="button" onClick={clearReplyImage} aria-label="画像を外す" title="画像を外す" style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', lineHeight: 1 }}>×</button>
                    </div>
                  )}
                  {replyOpen === post.id && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={replyText}
                        maxLength={MIKOPOS_REPLY_MAX + noteLinksLength(replyText) + (replyText.includes('?note=') ? 0 : 120)}
                        autoFocus
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void handleReply(post.id); } }}
                        onPaste={e => {
                          const f = Array.from(e.clipboardData?.files ?? []).find(x => x.type.startsWith('image/'));
                          if (f) { e.preventDefault(); pickReplyImage(f); }
                        }}
                        placeholder={`${post.author} さんに返信`}
                        aria-label="返信の本文"
                        style={inputStyle}
                      />
                      <button type="button" onClick={() => replyFileRef.current?.click()} disabled={replyBusy} title="返信に画像・GIF を付ける(ドラッグや貼り付けでも付けられます)" aria-label="返信に画像・GIF を付ける" style={smallBtn}>画像</button>
                      <input ref={replyFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { pickReplyImage(e.target.files?.[0]); e.target.value = ''; }} />
                      <button type="button" onClick={() => void handleReply(post.id)} disabled={replyBusy || (!replyText.trim() && !replyImage)} style={{ ...smallBtn, color: '#fff', background: ACCENT, borderColor: ACCENT, fontWeight: 700, opacity: !replyBusy && (replyText.trim() || replyImage) ? 1 : 0.45 }}>{replyBusy ? '送信中…' : '送信'}</button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ── 削除の確認 ── */}
      {deleteTarget && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDeleteTarget(null)}>
          <div role="dialog" aria-modal="true" aria-label="ポストの削除" onClick={e => e.stopPropagation()} style={{ background: cardBg, color: text, borderRadius: 14, padding: 16, width: '100%', maxWidth: 320 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>このポストを削除しますか?</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 6 }}>付いているいいね・返信・投票も一緒に消えます。元に戻せません。</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setDeleteTarget(null)} style={smallBtn}>キャンセル</button>
              <button type="button" onClick={() => void handleDelete(deleteTarget)} style={{ ...smallBtn, color: '#fff', background: '#ef4444', borderColor: '#ef4444', fontWeight: 700 }}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MikoposTimeline;
