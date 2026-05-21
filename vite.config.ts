import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
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
