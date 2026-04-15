import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// We use a dummy URL if missing to prevent the app from crashing on initialization
// The user will see warnings in the console and should provide real keys in the Secrets panel
const finalUrl = supabaseUrl || 'https://placeholder.supabase.co';
const finalKey = supabaseAnonKey || 'placeholder-key';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please check your .env file and ensure keys are prefixed with VITE_.');
}

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    // Explicitly pass native fetch to avoid "Cannot set property fetch of #<Window>" error
    // which happens when cross-fetch tries to polyfill in certain iframe environments
    fetch: (input, init) => globalThis.fetch(input, init),
  },
});
