import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode, command }) => {
    const env = loadEnv(mode, '.', '');
    // ビルドごとの番号。開きっぱなしの画面が「新しいバージョンが出た」ことに気づくために使う
    // (手元の開発サーバーでは 'dev' にして、お知らせを出さない)
    const buildId = command === 'build' ? String(Date.now()) : 'dev';
    return {
      plugins: [
        {
          // 配信先に version.json を置く(中身は、いま配信しているビルドの番号)
          name: 'mykonos-version-file',
          apply: 'build',
          generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) });
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__APP_VERSION__': JSON.stringify(pkg.version),
        '__BUILD_ID__': JSON.stringify(buildId),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // 重いライブラリを独立したチャンクに分割してキャッシュ効率を高める
        rollupOptions: {
          output: {
            manualChunks: {
              // Supabase クライアント（変更頻度低い→長期キャッシュ可）
              'vendor-supabase': ['@supabase/supabase-js'],
              // Excel ライブラリ（管理画面でのみ使用）
              'vendor-xlsx': ['xlsx'],
              // React コア
              'vendor-react': ['react', 'react-dom'],
            },
          },
        },
        // 警告しきい値を 600KB に調整（分割後のチャンクサイズに合わせる）
        chunkSizeWarningLimit: 600,
      },
    };
});
