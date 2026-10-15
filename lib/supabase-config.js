// Shared public configuration for the static browser client and Vercel API.
function supabaseConfig(env=process.env){return{
 URL:env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||'',
 KEY:env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||''
}}
module.exports={supabaseConfig};
