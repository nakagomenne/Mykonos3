import React, { useState } from 'react';
import { User } from '../types';
import { MASTER_PASSWORD } from '../constants';

interface LoginProps {
  onLogin: (user: User, isLoggedInAsAdmin: boolean) => void;
  users: User[];
}

const Login: React.FC<LoginProps> = ({ onLogin, users }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError('メンバー名を入力してください。');
      return;
    }
    const user = users.find(u => u.name.trim() === username.trim());
    if (!user) {
      setError('ユーザーが見つかりません。');
      return;
    }
    if (password === user.password || password === MASTER_PASSWORD) {
      setIsSubmitting(true);
      setTimeout(() => onLogin(user, user.isAdmin), 300);
    } else {
      setError('パスワードが正しくありません。');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 antialiased font-sans overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #e8f4f8 0%, #d0ecf4 40%, #c5e4ef 70%, #b8dce9 100%)',
      }}
    >
      {/* 背景の装飾円 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #0193be 0%, transparent 70%)' }} />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #0193be 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/4 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #0193be 0%, transparent 70%)' }} />
      </div>

      <div className="relative w-full max-w-md animate-fade-in-up">
        {/* カード本体 */}
        <div className="glass rounded-3xl overflow-hidden"
          style={{
            boxShadow: '0 8px 40px rgba(1,147,190,0.18), 0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.6)',
          }}
        >
          {/* ヘッダーグラデーション */}
          <div className="header-gradient-blue px-8 pt-10 pb-8 text-center relative overflow-hidden">
            {/* 内側の光 */}
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.6) 0%, transparent 60%)' }}
              aria-hidden="true"
            />
            <h1 className="relative text-6xl font-bold font-inconsolata text-white tracking-tight"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.2)' }}>
              Mykonos
            </h1>
            <p className="relative mt-2 text-sm text-white/75 tracking-wide">
              ログインしてください
            </p>
          </div>

          {/* フォームエリア */}
          <div className="px-8 py-8">
            <form onSubmit={handleLogin} className="space-y-5">
              {/* メンバー名 */}
              <div className="group">
                <label htmlFor="username" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  メンバー名
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  required
                  placeholder="名前を入力"
                  className="w-full bg-white/80 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 placeholder:text-slate-300 focus:outline-none input-glow transition-all duration-200 text-sm font-medium"
                  autoComplete="username"
                />
              </div>

              {/* パスワード */}
              <div className="group">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  required
                  placeholder="••••••••"
                  className="w-full bg-white/80 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 placeholder:text-slate-300 focus:outline-none input-glow transition-all duration-200 text-sm font-medium"
                  autoComplete="current-password"
                />
              </div>

              {/* エラー */}
              <div className="h-5">
                {error && (
                  <p className="text-sm text-red-500 text-center animate-float-up font-medium">{error}</p>
                )}
              </div>

              {/* ログインボタン */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full py-3 rounded-xl text-white text-sm font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-[#0193be] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #0193be 0%, #0277a8 100%)',
                  boxShadow: '0 4px 14px rgba(1,147,190,0.4)',
                }}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    ログイン中...
                  </span>
                ) : 'ログイン'}
              </button>
            </form>
          </div>
        </div>

        {/* バージョン表示 */}
        <p className="text-center mt-4 text-xs text-slate-400 font-inconsolata">Mykonos — CRM Platform</p>
      </div>
    </div>
  );
};

export default Login;
