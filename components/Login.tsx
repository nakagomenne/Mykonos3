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

    // Check against user's specific password OR the master password.
    if (password === user.password || password === MASTER_PASSWORD) {
      // Log in as admin if the user has the admin flag.
      onLogin(user, user.isAdmin);
    } else {
      setError('パスワードが正しくありません。');
    }
  };

  return (
    <div className="bg-white min-h-screen flex items-center justify-center p-4 antialiased font-sans">
      <div className="group relative w-full max-w-lg aspect-square">
        {/* Ring and backdrop */}
        <div className="absolute inset-0 rounded-full border-[10px] border-[#0193be] shadow-2xl"></div>
        <div className="absolute inset-[8px] rounded-full bg-white/95 backdrop-blur-sm shadow-inner transition-colors duration-500 ease-in-out group-hover:bg-[#0193be]"></div>

        {/* Form content */}
        <div className="relative h-full flex flex-col items-center justify-center px-12">
            <div className="text-center mb-6">
              <h1 className="text-7xl font-bold text-[#0193be] font-inconsolata transition-colors duration-500 ease-in-out group-hover:text-white">Mykonos</h1>
              <p className="mt-1 text-base text-[#0193be]/80 transition-colors duration-500 ease-in-out group-hover:text-white/80">ログインしてください</p>
            </div>
            <form className="w-full max-w-xs mx-auto" onSubmit={handleLogin}>
              <div className="bg-white border border-slate-200 rounded-lg shadow-inner p-4 space-y-4 mb-1">
                <div>
                  <label htmlFor="username" className="sr-only">メンバー名</label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError('');
                    }}
                    required
                    placeholder="メンバー名"
                    className="w-full bg-transparent border-b-2 border-slate-300 focus:border-[#0193be] py-1.5 focus:outline-none text-[#0193be] placeholder:text-slate-400 text-center transition"
                  />
                </div>
                <div>
                  <label htmlFor="password"  className="sr-only">パスワード</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    required
                    placeholder='パスワード'
                    className="w-full bg-transparent border-b-2 border-slate-300 focus:border-[#0193be] py-1.5 focus:outline-none text-[#0193be] placeholder:text-slate-400 text-center transition"
                  />
                </div>
              </div>
              
              <div className="h-5 text-center mt-2">
                {error && <p className="text-sm text-red-500 group-hover:text-yellow-300 transition-colors duration-500">{error}</p>}
              </div>

              <div className="flex justify-center mt-2">
                <button
                  type="submit"
                  className="flex justify-center py-2.5 px-16 border-2 border-[#0193be] rounded-full shadow-lg text-sm font-medium text-[#0193be] bg-white hover:bg-[#0193be] hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0193be] transition-colors duration-500 ease-in-out group-hover:bg-transparent group-hover:border-white group-hover:text-white group-hover:hover:bg-white group-hover:hover:text-[#0193be]"
                >
                  ログイン
                </button>
              </div>
            </form>
        </div>
      </div>
    </div>
  );
};

export default Login;