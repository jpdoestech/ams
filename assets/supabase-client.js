/* Browser-only app: the SDK persists sessions and refreshes access tokens. */
(function(root){
 root.AMSAuth={credentials(email,password,signup=false){
  email=String(email||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Object.assign(Error('Enter a valid email address. Use your registered email, not a username.'),{fields:['le']});
  if(!password)throw Object.assign(Error('Enter your password.'),{fields:['lp']});
  if(signup&&password.length<6)throw Object.assign(Error('Use at least 6 characters for a new password.'),{fields:['lp']});
  return{email,password};
 },errorMessage(error){
  const message=String(error?.message||error||'Request failed'),code=error?.code;
  const help={invalid_credentials:'Check your registered email and password.',email_not_confirmed:'Confirm your email using the link in your inbox before signing in.',signup_disabled:'Ask your administrator for access.',over_email_send_rate_limit:'Wait before requesting another email.',over_request_rate_limit:'Wait before trying again.',refresh_token_not_found:'Your session expired. Sign in again.',refresh_token_already_used:'Your session expired. Sign in again.',PGRST202:'Ask your administrator to apply the required database migrations and reload the schema cache.'}[code];
  return message+(code?' ['+code+']':'')+(help?' '+help:'')+(/No API key found in request/i.test(message)?' Open AMS from its site URL. If this occurs inside AMS, ask your administrator to check the public Supabase configuration and request headers.':'');
 },errorFields(error){
  if(Array.isArray(error?.fields))return error.fields;
  const fields={invalid_credentials:['le','lp'],email_not_confirmed:['le'],email_address_invalid:['le'],email_address_not_authorized:['le'],email_exists:['le'],user_already_exists:['le'],weak_password:['lp']}[error?.code];
  if(fields)return fields;
  const message=String(error?.message||error||'');
  if(/Contact number must/i.test(message))return ['f_contact','sc'];
  if(/schedule or assignment reason|Effective date and reason required/i.test(message))return ['schedule-reason','assignment-reason'];
  if(/Choose a valid schedule effective date/i.test(message))return ['schedule-from','assignment-from'];
  if(/Employee No and Last Name are required/i.test(message))return ['f_emp_no','f_last_name'];
  return [];
 },invalidSession(error){return ['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(error?.code)},createClient(config){
  if(!config.URL||!config.KEY)throw Error('Supabase URL and publishable key are required');
  return root.supabase.createClient(config.URL,config.KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 }};
})(globalThis);
