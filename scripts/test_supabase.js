require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE env vars. Check .env');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  try {
    console.log('Testing Supabase connectivity...');
    console.log('\n1) Querying default schema (public.users)...');
    const resDefault = await supabase.from('users').select('id,email').limit(1);
    console.log('Default schema result:', JSON.stringify(resDefault, null, 2));

    console.log('\n2) Querying app_auth schema (app_auth.users)...');
    const resAuth = await supabase.schema('app_auth').from('users').select('id,email').limit(1);
    console.log('app_auth schema result:', JSON.stringify(resAuth, null, 2));
  } catch (err) {
    console.error('Unexpected Error:', err);
  }
})();
