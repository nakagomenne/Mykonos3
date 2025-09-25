// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,rpcfucwdeofghxwxfhwb
  import.meta.env.VITE_SUPABASE_ANON_KEY!eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwY2Z1Y3dkZW9mZ2h4d3hmaHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5ODkyMDgsImV4cCI6MjA3MzU2NTIwOH0.kjaPd7FA0FRNMh3bfaZYrAufO4JJ4NbCW4ONmQOgqA0
);
