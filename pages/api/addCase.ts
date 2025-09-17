import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

// 案件追加API
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { user_fullname, customer_name, customer_phone, note } = req.body

  if (!user_fullname || !customer_name || !customer_phone) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // 案件登録
  const { data, error } = await supabase
    .from('call_requests')
    .insert([
      {
        user_id: null, // まだ担当者未割当なら null
        customer_name,
        customer_phone,
        note,
      },
    ])
    .select()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ message: 'Case added', case: data[0] })
}
