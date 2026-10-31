import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './icons';

interface UsageGuideModalProps {
  isDarkMode?: boolean;
  onClose: () => void;
}

interface GuidePoint {
  title: string;
  body: string;
}

interface GuideChapter {
  id: string;
  icon: string;
  title: string;
  lead: string;
  image?: string;
  imageAlt?: string;
  /** 画像内の赤い丸数字(①②…)に対応する説明 */
  points?: GuidePoint[];
  tips?: string[];
}

// 画像は public/guide/ に置いたスクリーンショット(ダミーデータで撮影)。
// 画面を変更したときは、画像と説明をここで更新してください。
const IMG = (name: string) => `/guide/${name}`;

const CHAPTERS: GuideChapter[] = [
  {
    id: 'header',
    icon: '🧭',
    title: '画面の見かた(ヘッダー)',
    lead: '画面の一番上には、よく使う機能が並んでいます。',
    image: IMG('01_header.png'),
    imageAlt: 'ヘッダーの画面。検索・ノート・ポスト・各種ボタン・ユーザーメニューに番号が付いています',
    points: [
      { title: '検索', body: '顧客IDまたはメンバー名を入力して探せます。' },
      { title: 'ノート', body: 'メモや共有事項を書いて整理・共有できます。未確認の「周知」があると赤いバッジが付きます。' },
      { title: 'ポスト', body: '一言コメント(120文字まで)を投稿して、メンバーのポストを見られます。「いいね」や返信もできます。' },
      { title: '管理者用メニュー', body: '管理者のみ表示されます。アラートの確認、ユーザー管理、周知事項、稼働ルールなどを扱います。' },
      { title: 'ユーザーメニュー', body: '稼働ステータス、各種設定、この使い方ガイド、ログアウトなどはここからです。' },
      { title: 'お知らせバー', body: '管理者からのお知らせが流れます。' },
    ],
  },
  {
    id: 'mine',
    icon: '🙋',
    title: '自分のページ(タブとプロフィール)',
    lead: 'ログインすると「自分」タブが開きます。自分宛の案件の状況をひと目で確認できます。',
    image: IMG('02_profile.png'),
    imageAlt: 'タブとプロフィール欄の画面',
    points: [
      { title: 'タブ', body: '「自分」「自分以外」のほか、権限がある人には「回線前確」「電気契確」も表示されます。赤い数字は、確認していない新着の件数です。' },
      { title: 'アイコン', body: 'プロフィール画像です。変更はユーザーメニューの「アイコン変更」から行えます。' },
      { title: 'ポスト', body: '自分が投稿した一言です。クリックすると編集できます。' },
      { title: '稼働ステータス', body: '「受付可」「一時受付不可」「当日受付不可」「非稼働」のいずれかです。変更はユーザーメニューから行い、他のメンバーにも表示されます。' },
      { title: '件数', body: '見込・見込留守・長期見込の件数です。' },
    ],
    tips: ['稼働ステータスは、ユーザーメニューの一番上から切り替えます。席を外すときは忘れずに変更しましょう。'],
  },
  {
    id: 'create',
    icon: '➕',
    title: '案件を作成する',
    lead: '「新規作成」を押すとフォームが開きます。必須項目(*)を入力して「依頼を作成」を押してください。',
    image: IMG('03_form.png'),
    imageAlt: '新規作成フォームの画面',
    points: [
      { title: '顧客ID', body: '顧客IDを入力します。同じIDがすでにある場合は、確認メッセージが表示されます。' },
      { title: '担当者', body: '案件を担当するメンバーを選びます。' },
      { title: '予定日時', body: '日付と時刻(または「待機中」「至急」「このあとOK」「時設なし」「入電待ち」)を選びます。「厳守」「詳細な時設」も指定できます。' },
      { title: 'ランク・リスト種別', body: 'ランクとリスト種別(回線 / MF / OK / NG / 保険)を選びます。★で重要な案件に印を付けられます。' },
      { title: '備考', body: '申し送り事項を書きます。「定型文」から、よく使う文章をすぐ入れられます。' },
      { title: '依頼を作成', body: '入力できたら押します。「クリア」で入力内容をリセットできます。' },
    ],
  },
  {
    id: 'list',
    icon: '📋',
    title: '案件の一覧と操作',
    lead: '自分宛の案件が、日時の近い順に並びます。色や表示で状況がわかります。',
    image: IMG('04_list.png'),
    imageAlt: '案件一覧の画面',
    points: [
      { title: '完了非表示', body: 'オンにすると、完了した案件を隠します。オフにすると、完了済みも表示されます。' },
      { title: '顧客ID', body: '右のアイコンでIDをコピーできます。「NEW」は新しく届いた案件です。左の丸にチェックを入れると完了にできます。' },
      { title: '日時', body: '予定日時です。「至急」は赤、「待機中」は緑など、色で見分けられます。クリックして変更できます。' },
      { title: 'ランク', body: '案件のランクです。クリックして変更できます。' },
      { title: '留守', body: '留守だった回数です。電話のアイコンを押すと1回ずつ増えます(最大9回)。見込ランクは、対応する「留守」ランクに自動で変わります。' },
      { title: '編集', body: '種別・担当・依頼者・備考などを編集できます。' },
    ],
    tips: ['一覧の行をクリックすると、次の「案件の詳細」画面が開きます。'],
  },
  {
    id: 'detail',
    icon: '🔍',
    title: '案件の詳細',
    lead: '一覧の行をクリックすると、案件の詳細が表示されます。備考の全文や、作成日時などを確認できます。',
    image: IMG('05_detail.png'),
    imageAlt: '依頼詳細の画面',
    points: [
      { title: '顧客ID', body: '「コピー」アイコンでIDをコピーできます。' },
      { title: '担当・日時・ランク', body: '担当者、架電予定日時、ランク、リスト種別を確認できます。' },
      { title: 'ノートに保存', body: '備考をノートに移せます。保存後に、案件を完了にするかどうかを選べます。' },
    ],
  },
  {
    id: 'others',
    icon: '👥',
    title: '自分以外のメンバー・シフト・新規依頼',
    lead: '「自分以外」タブでは、メンバーごとの案件を見たり、他のメンバーへ依頼したりできます。',
    image: IMG('06_others.png'),
    imageAlt: '自分以外タブの画面',
    points: [
      { title: 'メンバー一覧', body: 'アイコンの色は稼働ステータスです(青:受付可 / 黄:一時受付不可 / 赤:当日受付不可 / 灰:非稼働)。押すとそのメンバーの案件が見られます。' },
      { title: '新規依頼', body: '他のメンバー宛の案件を作成します。作り方は「案件を作成する」と同じです。' },
      { title: 'シフト確認', body: 'カレンダーで日付を選ぶと、その日に稼働するメンバーを確認できます。依頼する前の確認に便利です。' },
    ],
    tips: ['稼働していないメンバーに依頼しようとすると、確認メッセージが出ることがあります。'],
  },
  {
    id: 'post',
    icon: '💬',
    title: 'ポスト(ひとこと投稿)',
    lead: 'ヘッダーの吹き出しアイコンから、ひとことを投稿したり、みんなのポストを見たりできます。',
    image: IMG('07_post.png'),
    imageAlt: 'ポストの画面',
    points: [
      { title: '投稿欄', body: '120文字まで入力できます。「ポスト」で投稿すると、プロフィールにも表示されます。「削除」で取り下げられます。' },
      { title: 'いいね', body: 'ハートを押すと「いいね」できます。もう一度押すと取り消します。' },
      { title: '返信', body: '「返信」から、そのポストにコメントできます。' },
    ],
    tips: ['新しいポストや返信があると、アイコンに数字のバッジが付きます。開くと既読になります。'],
  },
  {
    id: 'notes',
    icon: '📓',
    title: 'ノート',
    lead: 'ヘッダーの本のアイコンから開きます。メモ、手順、共有事項などを書いて整理できます。',
    image: IMG('08_notes.png'),
    imageAlt: 'ノート画面の編集中の様子',
    points: [
      { title: '新規ノート', body: '押すと作成画面が開きます。「保存」を押すと作成されます。' },
      { title: 'フォルダ・一覧', body: '左でフォルダや「周知」「共有されたノート」を切り替えます。中央にノートが並びます。' },
      { title: '公開範囲・フォルダ・タグ', body: '自分だけ / 全員 / 管理者 / 選んだメンバーから選べます。' },
      { title: '本文', body: '「書式・添付」から、見出し・箇条書き・表・画像などを使えます。画像は貼り付けでも入れられます。' },
    ],
    tips: [
      '保存済みのノートは、開くと閲覧モードで表示されます。書き換えるときは「✏️ 編集」を押し、終わったら「完了」を押します。',
      'パソコンでは、ノートを開くと、フォルダ欄とノート一覧が左端のバーにたたまれて、本文が広く表示されます。バーを押すと、それぞれ開きます。',
      'ノート画面の「？」から、ノートの詳しい使い方も見られます。',
      '「周知」を使うと、読んでほしい内容をメンバーに通知し、誰が確認したかを見られます。',
    ],
  },
  {
    id: 'menu',
    icon: '⚙️',
    title: 'ユーザーメニュー(設定)',
    lead: '右上の自分の名前を押すと開きます。',
    image: IMG('09_menu.png'),
    imageAlt: 'ユーザーメニューの画面',
    points: [
      { title: '稼働ステータス', body: '受付可 / 一時受付不可 / 当日受付不可 / 非稼働 を切り替えます。' },
      { title: '各種設定', body: 'スケジュール、稼働時間、パスワード、アイコンを設定します。' },
      { title: 'ポスト・稼働ルール・バグ報告 / 要望・使い方ガイド', body: '不具合や「こうしてほしい」はここから送れます。' },
      { title: 'ダークモード', body: '画面を暗い配色に切り替えます。' },
      { title: '通知設定', body: 'ブラウザの通知を設定します。' },
      { title: 'ログアウト', body: 'ログアウトします。共用のパソコンでは必ず行ってください。' },
    ],
  },
  {
    id: 'faq',
    icon: '❓',
    title: 'こんなときは',
    lead: '困ったときの確認ポイントです。',
    tips: [
      '表示が古い・動きがおかしいときは、ブラウザを再読み込み(F5)してください。',
      '案件が見つからないときは、「完了非表示」がオンになっていないか、検索窓にIDを入れて確認してください。',
      '日時を間違えたときは、一覧の日時をクリックして直せます。',
      '不具合や要望は、ユーザーメニューの「バグ報告 / 要望」から送ってください。',
      '画面の写真はサンプルデータです。実際の表示とは名前や件数が異なります。',
    ],
  },
];

const UsageGuideModal: React.FC<UsageGuideModalProps> = ({ isDarkMode = false, onClose }) => {
  const d = isDarkMode;
  const [activeId, setActiveId] = useState(CHAPTERS[0].id);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const lockScrollSpy = useRef(false);

  // Esc で閉じる(拡大中は拡大だけ閉じる)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoom) setZoom(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, onClose]);

  // 背景のスクロールを止める
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const goTo = (id: string) => {
    setActiveId(id);
    const el = sectionRefs.current[id];
    const box = scrollRef.current;
    if (el && box) {
      lockScrollSpy.current = true;
      box.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
      window.setTimeout(() => { lockScrollSpy.current = false; }, 600);
    }
  };

  // スクロール位置に合わせて目次の選択を更新
  const onScroll = () => {
    if (lockScrollSpy.current) return;
    const box = scrollRef.current;
    if (!box) return;
    const y = box.scrollTop + 40;
    let cur = CHAPTERS[0].id;
    for (const c of CHAPTERS) {
      const el = sectionRefs.current[c.id];
      if (el && el.offsetTop <= y) cur = c.id;
    }
    setActiveId(cur);
  };

  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-300' : 'text-slate-600';

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-2 sm:p-4 z-[210]" onClick={onClose} role="dialog" aria-modal="true" aria-label="使い方ガイド">
      <div
        className={`${d ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700'} rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 flex items-center justify-between bg-[#0193be] text-white flex-shrink-0">
          <h2 className="text-lg font-bold">📖 Mykonos 使い方ガイド</h2>
          <button onClick={onClose} aria-label="閉じる" className="p-1 rounded-full hover:bg-white/20">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* スマホ: 横スクロールの目次 */}
        <div className={`md:hidden flex gap-2 overflow-x-auto px-3 py-2 border-b ${border} flex-shrink-0`}>
          {CHAPTERS.map(c => (
            <button
              key={c.id}
              onClick={() => goTo(c.id)}
              className={`whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                activeId === c.id
                  ? 'bg-[#0193be] text-white border-[#0193be]'
                  : d ? 'border-slate-600 text-slate-300' : 'border-slate-300 text-slate-600'
              }`}
            >
              {c.icon} {c.title.replace(/\(.*\)/, '')}
            </button>
          ))}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* PC: 左の目次 */}
          <nav className={`hidden md:block w-60 flex-shrink-0 border-r ${border} overflow-y-auto py-3 ${d ? 'bg-[#151c2b]' : 'bg-slate-50'}`}>
            <div className={`px-4 pb-2 text-[11px] font-bold tracking-wider ${d ? 'text-slate-400' : 'text-slate-500'}`}>もくじ</div>
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                onClick={() => goTo(c.id)}
                className={`w-full text-left px-4 py-2 text-sm flex items-start gap-2 transition-colors border-l-4 ${
                  activeId === c.id
                    ? d ? 'bg-slate-700/60 border-[#0193be] font-bold text-white' : 'bg-[#0193be]/10 border-[#0193be] font-bold text-[#017a9c]'
                    : d ? 'border-transparent hover:bg-slate-700/40' : 'border-transparent hover:bg-slate-100'
                }`}
              >
                <span className="flex-shrink-0">{c.icon}</span>
                <span><span className={`text-xs mr-1 ${d ? 'text-slate-400' : 'text-slate-400'}`}>{i + 1}.</span>{c.title}</span>
              </button>
            ))}
          </nav>

          {/* 本文 */}
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 relative scroll-smooth">
            <p className={`text-sm ${muted} mb-6 leading-relaxed`}>
              Mykonos(ミコノス)は、案件の依頼・管理、メンバーとの連絡をひとつにまとめたツールです。
              ここでは、画面の写真を見ながら基本の使い方を説明します。写真の<span className="inline-block mx-1 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">1</span>のような赤い数字は、各項目の説明と対応しています。写真を押すと大きく表示できます。
            </p>

            {CHAPTERS.map((c, i) => (
              <section
                key={c.id}
                ref={el => { sectionRefs.current[c.id] = el; }}
                className={`pb-8 mb-8 ${i < CHAPTERS.length - 1 ? `border-b ${border}` : ''}`}
              >
                <h3 className={`text-lg font-bold mb-1 flex items-center gap-2 ${d ? 'text-white' : 'text-slate-800'}`}>
                  <span className="text-xl">{c.icon}</span>
                  <span><span className="text-[#0193be] mr-1">{i + 1}.</span>{c.title}</span>
                </h3>
                <p className={`text-sm ${muted} mb-3 leading-relaxed`}>{c.lead}</p>

                {c.image && !failed[c.id] && (
                  <button
                    type="button"
                    onClick={() => setZoom({ src: c.image!, alt: c.imageAlt || c.title })}
                    className={`block w-full rounded-lg overflow-hidden border ${border} mb-4 cursor-zoom-in bg-slate-100 group relative`}
                    aria-label={`${c.title}の画像を拡大`}
                  >
                    <img
                      src={c.image}
                      alt={c.imageAlt || c.title}
                      loading="lazy"
                      className="w-full h-auto block"
                      onError={() => setFailed(f => ({ ...f, [c.id]: true }))}
                    />
                    <span className="absolute right-2 bottom-2 text-[11px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full opacity-90">🔍 拡大</span>
                  </button>
                )}
                {c.image && failed[c.id] && (
                  <div className={`rounded-lg border border-dashed ${border} p-4 mb-4 text-xs ${muted}`}>画像を読み込めませんでした。</div>
                )}

                {c.points && (
                  <ol className="space-y-2.5 mb-3">
                    {c.points.map((pt, idx) => (
                      <li key={pt.title} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center mt-0.5" aria-label={`番号${idx + 1}`}>{idx + 1}</span>
                        <div className="text-sm leading-relaxed">
                          <span className={`font-bold ${d ? 'text-white' : 'text-slate-800'}`}>{pt.title}</span>
                          <span className={`${muted}`}> — {pt.body}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {c.tips && c.tips.length > 0 && (
                  <ul className={`rounded-lg px-4 py-3 space-y-1.5 text-sm leading-relaxed ${d ? 'bg-amber-400/10 text-amber-100' : 'bg-amber-50 text-amber-900'}`}>
                    {c.tips.map(t => (
                      <li key={t} className="flex gap-2"><span className="flex-shrink-0">💡</span><span>{t}</span></li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <div className="h-24" />
          </div>
        </div>

        <div className={`px-4 py-3 border-t ${border} flex items-center justify-between flex-shrink-0`}>
          <span className={`text-xs ${d ? 'text-slate-400' : 'text-slate-500'}`}>※ 写真はサンプルデータです</span>
          <button onClick={onClose} className="px-5 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c]">閉じる</button>
        </div>
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[220] bg-black/85 flex items-center justify-center p-2 cursor-zoom-out"
          onClick={e => { e.stopPropagation(); setZoom(null); }}
        >
          <button className="absolute top-3 right-3 text-white p-2 rounded-full bg-black/50 hover:bg-black/70" aria-label="拡大を閉じる">
            <XMarkIcon className="w-6 h-6" />
          </button>
          <img src={zoom.src} alt={zoom.alt} className="max-w-full max-h-full object-contain rounded shadow-2xl" />
        </div>
      )}
    </div>,
    document.body
  );
};

export default UsageGuideModal;
