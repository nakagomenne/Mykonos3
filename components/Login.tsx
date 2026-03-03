import React, { useState } from 'react';
import { User } from '../types';
import { MASTER_PASSWORD } from '../constants';

interface LoginProps {
  onLogin: (user: User, isLoggedInAsAdmin: boolean) => void;
  users: User[];
  appVersion?: string;
}

const Login: React.FC<LoginProps> = ({ onLogin, users, appVersion = 'ver 3.0.0' }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) { setError('メンバー名を入力してください。'); return; }
    const user = users.find(u => u.name.trim() === username.trim());
    if (!user) { setError('ユーザーが見つかりません。'); return; }
    if (password === user.password || password === MASTER_PASSWORD) {
      setIsSubmitting(true);
      setTimeout(() => onLogin(user, user.isAdmin), 300);
    } else {
      setError('パスワードが正しくありません。');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 antialiased font-sans overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #e8f4f8 0%, #d0ecf4 40%, #c5e4ef 70%, #b8dce9 100%)' }}
    >
      <style>{`
        /* ── ログインカード ホバーグラデーション ── */
        .login-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          width: 400px;
          height: 400px;
          /* ライト状態のベース */
          background: rgba(255,255,255,0.72);
          border: 1px solid rgba(255,255,255,0.55);
          box-shadow: 0 8px 48px rgba(1,147,190,0.22), 0 2px 10px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          /* ダーク状態へのグラデーションを pseudo で重ねる */
          transition: box-shadow 1.2s cubic-bezier(0.4,0,0.2,1),
                      border-color 1.2s cubic-bezier(0.4,0,0.2,1);
        }
        /* hover時のグラデーション層を ::before で乗せ、opacityをアニメート */
        .login-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: linear-gradient(150deg, #012f45 0%, #014f6e 35%, #0193be 70%, #01aad8 100%);
          opacity: 0;
          transition: opacity 1.2s cubic-bezier(0.4,0,0.2,1);
          pointer-events: none;
          z-index: 0;
        }
        .login-card.hovered::before {
          opacity: 1;
        }
        .login-card.hovered {
          border-color: rgba(1,170,216,0.5);
          box-shadow: 0 12px 60px rgba(1,147,190,0.55), 0 4px 16px rgba(0,0,0,0.25), 0 0 0 1px rgba(1,170,216,0.3);
        }
        /* カード内コンテンツは z-index:1 で前面に */
        .login-card-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }

        /* 内側グロー */
        .login-card-glow {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          pointer-events: none;
          z-index: 0;
          /* ライト状態 */
          background: radial-gradient(ellipse at 50% 0%, rgba(1,147,190,0.12) 0%, transparent 60%);
          transition: background 1.2s ease;
        }
        .login-card.hovered .login-card-glow {
          background: radial-gradient(ellipse at 50% 100%, rgba(1,47,69,0.4) 0%, transparent 60%);
        }

        /* タイトル */
        .login-title {
          font-size: 44px;
          line-height: 1;
          color: #0193be;
          text-shadow: 0 2px 10px rgba(1,147,190,0.25);
          transition: color 1.2s ease, text-shadow 1.2s ease;
        }
        .login-card.hovered .login-title {
          color: #ffffff;
          text-shadow: 0 2px 16px rgba(0,0,0,0.35);
        }

        /* サブタイトル */
        .login-subtitle {
          color: rgba(1,147,190,0.6);
          transition: color 1.2s ease;
        }
        .login-card.hovered .login-subtitle {
          color: rgba(255,255,255,0.65);
        }

        /* インプット */
        .login-input {
          width: 100%;
          border-radius: 9999px;
          padding: 0.625rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 500;
          text-align: center;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          outline: none;
          /* ライト状態 */
          background: rgba(255,255,255,0.80);
          border: 1px solid rgba(1,147,190,0.25);
          color: #334155;
          transition: background 1.2s ease, border-color 1.2s ease, color 1.2s ease;
        }
        .login-input::placeholder {
          color: rgba(51,65,85,0.45);
          transition: color 1.2s ease;
        }
        .login-card.hovered .login-input {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.35);
          color: #ffffff;
        }
        .login-card.hovered .login-input::placeholder {
          color: rgba(255,255,255,0.45);
        }
        .login-input:focus {
          ring: 2px solid #0193be;
        }

        /* エラー */
        .login-error {
          color: #ef4444;
          transition: color 1.2s ease;
        }
        .login-card.hovered .login-error {
          color: #fca5a5;
        }
      `}</style>

      {/* ── 背景装飾円（大・中・小） ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #0193be 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #0193be 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 left-2/3 w-56 h-56 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #0277a8 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 left-1/4 w-32 h-32 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #0193be 0%, transparent 70%)' }} />
      </div>

      {/* ── メインの円形カード ── */}
      <div className="relative animate-fade-in-up flex flex-col items-center">

        {/* 外側リング装飾 */}
        <div className="absolute rounded-full opacity-20 pointer-events-none"
          style={{
            width: 460, height: 460,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            border: '1px solid rgba(1,147,190,0.6)',
          }} />
        <div className="absolute rounded-full opacity-10 pointer-events-none"
          style={{
            width: 520, height: 520,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            border: '1px solid rgba(1,147,190,0.4)',
          }} />

        {/* 円形カード本体 */}
        <div
          className={`login-card${isHovered ? ' hovered' : ''}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 内側グロー */}
          <div className="login-card-glow" aria-hidden="true" />

          {/* カード内コンテンツ */}
          <div className="login-card-content">
            {/* タイトル */}
            <h1
              className="login-title font-inconsolata font-bold tracking-tight select-none"
            >
              Mykonos
            </h1>
            <p
              className="login-subtitle mt-1 mb-6 text-xs tracking-widest font-semibold font-inconsolata"
            >
              {appVersion}
            </p>

            {/* フォーム */}
            <form onSubmit={handleLogin} className="w-full px-10 flex flex-col items-center gap-3">
              {/* メンバー名 */}
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                required
                placeholder="メンバー名"
                className="login-input focus:ring-2"
                autoComplete="username"
              />

              {/* パスワード */}
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
                placeholder="パスワード"
                className="login-input focus:ring-2"
                autoComplete="current-password"
              />

              {/* エラー */}
              <div className="h-4 w-full text-center">
                {error && (
                  <p className="login-error text-xs animate-float-up font-medium">{error}</p>
                )}
              </div>

              {/* ログインボタン — 円形 */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-14 h-14 rounded-full text-white text-xs font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-[#0193be] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #0193be 0%, #0277a8 100%)',
                  boxShadow: '0 4px 18px rgba(1,147,190,0.5)',
                }}
              >
                {isSubmitting ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : (
                  /* 右向き矢印アイコン */
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* バージョン */}
        <p className="mt-6 text-xs text-slate-400 font-inconsolata tracking-wider">Mykonos — CRM Platform</p>
      </div>
    </div>
  );
};

export default Login;
