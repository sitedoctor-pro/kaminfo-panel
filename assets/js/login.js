const sb=window.caminfoSupabase;
const qs=s=>document.querySelector(s);

async function signIn(email,password){
  return sb.auth.signInWithPassword({email,password});
}

async function signUp(email,password){
  const signUpResult=await sb.auth.signUp({email,password});
  if(signUpResult.error)return signUpResult;

  return sb.auth.signInWithPassword({email,password});
}

async function redirectIfLoggedIn(){
  const{data:{session}}=await sb.auth.getSession();
  if(!session)return;

  const{data,error}=await sb
    .from('admin_users')
    .select('id')
    .limit(1);

  if(!error&&data?.length)location.href='index.html';
}

document.addEventListener('DOMContentLoaded',()=>{
  redirectIfLoggedIn();

  qs('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();

    const errorEl=qs('#loginError');
    const btn=e.submitter;

    errorEl.textContent='';
    btn.disabled=true;
    btn.textContent='Logging in...';

    try{
      const{error}=await signIn(
        qs('#loginEmail').value.trim(),
        qs('#loginPassword').value
      );

      if(error)throw error;

      const{data:admins,error:adminError}=await sb
        .from('admin_users')
        .select('id')
        .limit(1);

      if(adminError||!admins?.length){
        await sb.auth.signOut();
        throw new Error('This account is not registered as an admin.');
      }

      location.href='index.html';
    }catch(err){
      errorEl.textContent=err.message||'Login failed.';
    }finally{
      btn.disabled=false;
      btn.textContent='Login';
    }
  });
});
