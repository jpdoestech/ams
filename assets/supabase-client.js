/* Browser-only app: the SDK persists sessions and refreshes access tokens. */
(function(root){
 root.AMSAuth={createClient(config){
  if(!config.URL||!config.KEY)throw Error('Supabase URL and publishable key are required');
  return root.supabase.createClient(config.URL,config.KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 }};
})(globalThis);
