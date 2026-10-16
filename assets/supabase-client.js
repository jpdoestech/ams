/* Browser-only app: the SDK persists sessions and refreshes access tokens. */
(function(root){
 root.AMSAuth={credentials(email,password,signup=false){
  email=String(email||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address. Use your registered email, not a username.');
  if(!password)throw Error('Enter your password.');
  if(signup&&password.length<6)throw Error('Use at least 6 characters for a new password.');
  return{email,password};
 },errorMessage(error){
  const message=String(error?.message||error||'Request failed'),code=error?.code;
  const help={invalid_credentials:'Check your registered email and password.',email_not_confirmed:'Confirm your email using the link in your inbox before signing in.',signup_disabled:'Ask your administrator for access.',over_email_send_rate_limit:'Wait before requesting another email.',over_request_rate_limit:'Wait before trying again.',refresh_token_not_found:'Your session expired. Sign in again.',refresh_token_already_used:'Your session expired. Sign in again.',PGRST202:'Ask your administrator to apply the required database migrations and reload the schema cache.'}[code];
  return message+(code?' ['+code+']':'')+(help?' '+help:'')+(/No API key found in request/i.test(message)?' Open AMS from its site URL. If this occurs inside AMS, ask your administrator to check the public Supabase configuration and request headers.':'');
 },invalidSession(error){return ['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(error?.code)},createClient(config){
  if(!config.URL||!config.KEY)throw Error('Supabase URL and publishable key are required');
  return root.supabase.createClient(config.URL,config.KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 }};
})(globalThis);
