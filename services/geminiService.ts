import { GoogleGenAI } from "@google/genai";
import { ListType, Rank } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateTalkScript = async (customerId: string, listType: ListType | '', rank: Rank): Promise<string> => {
  try {
    const prompt = `
      ## 指示
      あなたは優秀なコールセンターのスーパーバイザーです。
      以下の顧客情報、リスト種別、ランクに基づいて、丁寧かつプロフェッショナルなトーンで、簡潔で分かりやすいトークスクリプトを作成してください。
      スクリプトは、オペレーターがすぐに使える具体的な言葉で記述してください。

      ## 顧客情報
      - 顧客ID: ${customerId}
      - ランク: ${rank}

      ## リスト種別
      - ${listType || '指定なし'}

      ## トークスクリプト例
      お世話になっております。株式会社〇〇の〇〇と申します。
      [顧客名]様のお電話でいらっしゃいますでしょうか？

      （顧客確認後）

      私、顧客ID「${customerId}」の件でご連絡いたしました。
      今回は **${listType || '指定なし'}** の件でご連絡いたしました。
      [ここに顧客ランク「${rank}」を考慮した具体的な要件を記述]

      それでは、失礼いたします。

      ## 出力形式
      - マークダウン形式で、見出しや箇条書きを適切に使用して読みやすくしてください。
      - 特に重要な部分は太字で強調してください。
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    return response.text;
  } catch (error) {
    console.error("Error generating talk script:", error);
    return "トークスクリプトの生成に失敗しました。時間をおいて再度お試しください。";
  }
};