import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const args=process.argv.slice(2), options={};
for(let i=0;i<args.length;i+=2){
  assert.ok(['--source-root','--source-sha','--output','--mode'].includes(args[i]));
  assert.ok(args[i+1]&&!Object.hasOwn(options,args[i])); options[args[i]]=args[i+1];
}
const source=realpathSync(options['--source-root']), sha=options['--source-sha'], mode=options['--mode'];
assert.ok(['baseline','fixed'].includes(mode)); assert.match(sha,/^[a-f0-9]{40}$/);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),sha);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:source,encoding:'utf8'}).trim(),'');
if(mode==='baseline')assert.equal(sha,'b5f892dbfc906f15e18ca3d17155cde2ee5fdc12');
else assert.notEqual(sha,'b5f892dbfc906f15e18ca3d17155cde2ee5fdc12');
assert.equal(process.env.ACCOUNT_TEST_ISOLATED,'1');
assert.equal(process.env.ACCOUNT_DELIVERY_MODE,'test-sink');
assert.equal(process.env.PRIVILEGED_MFA_MODE,'enforce');
assert.equal(process.env.ACCOUNT_GOOGLE_ENABLED,'false');
assert.equal(process.env.SOCIAL_EMAIL_ENABLED,'false');
assert.notEqual(process.env.NODE_ENV,'production'); assert.ok(!process.env.VERCEL);
const database=new URL(process.env.DATABASE_URL);
assert.equal(database.hostname,'127.0.0.1');assert.equal(database.pathname,'/godschurches_security_test');
const origin=new URL(process.env.ACCOUNT_ORIGIN);assert.equal(origin.protocol,'https:');assert.equal(origin.hostname,'127.0.0.1');
assert.ok(process.env.ACCOUNT_TEST_SINK_DIR);
const output=resolve(options['--output']);
const sink=realpathSync(process.env.ACCOUNT_TEST_SINK_DIR);
assert.equal(realpathSync(dirname(output)),sink,'Output must be a direct new child of the actual sink');
assert.match(process.versions.node,/^24\./,'Use the retained Node 24 test runtime');
assert.ok(!relative(sink,output).startsWith('..')&&!isAbsolute(relative(sink,output)),'Output must be a new child of the owned fictional sink');
const paths=['lib/platform/account-boundary.ts','lib/platform/account-lifecycle.ts','lib/platform/account-sessions.ts','lib/platform/account-cookies.ts','lib/platform/account-credential.ts','lib/platform/accounts.ts','lib/platform/google-cookies.ts','lib/platform/account-limits.ts','tests/seed-portal.ts','tests/register.mjs','scripts/session-cookie-fixture.mjs','lib/platform/account-config.ts','package-lock.json','prisma/schema.prisma'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const bindings=paths.map(path=>({path,sha256:hash(readFileSync(join(source,path)))}));
mkdirSync(output,{mode:0o700});
const evidence={schema:1,recordedAt:null,sourceSha:sha,mode,scope:'Actual TypeScript account Request/Response boundary and canonical PostgreSQL services; no HTTPS server or browser',sourceBindings:bindings,cases:[],errors:[],networkAttempts:0,limiterResets:0,fictionalDatabaseWrites:'Four unique fictional accounts, their sessions and two canonical deactivation attempts; no cleanup/reset',productionWrites:0,providerSends:0,baselineReproductionConfirmed:false,limitations:['Response cookie deletion is observed directly; applying it to a browser cookie jar and client redirect are not modeled or claimed.','No retained RSC/focus/Google proof acceptance. The candidate full HTTPS/browser profile remains required.']};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async()=>{evidence.networkAttempts++;throw new Error('External transport forbidden in boundary probe');};
let db;
try{
  const require=createRequire(join(source,'package.json'));
  const {PrismaClient}=require('@prisma/client'); db=new PrismaClient();
  const mod=path=>import(pathToFileURL(join(source,path)).href);
  const {assertPortalTestDatabase}=await mod('tests/seed-portal.ts');
  await assertPortalTestDatabase(db);
  const {registerAccount,loginAccount,readAccountSession}=await mod('lib/platform/accounts.ts');
  const {handleAccountRequest}=await mod('lib/platform/account-boundary.ts');
  const {sessionCookieFixtureName}=await mod('scripts/session-cookie-fixture.mjs');
  const password='Fictional-owner-'+randomBytes(12).toString('hex');
  async function owner(login=true){
    const username='own_'+randomBytes(7).toString('hex'),email=username+'@example.test';
    await registerAccount(db,{username,name:'Fictional owner',email,role:'BELIEVER',password,confirmPassword:password});
    const user=await db.platformUser.findUniqueOrThrow({where:{username},select:{id:true,email:true}});
    return {...user,token:login?await loginAccount(db,email,password,'Fictional boundary reproduction'):null};
  }
  async function state(id){
    return {user:await db.platformUser.findUniqueOrThrow({where:{id},select:{deactivatedAt:true,credentialVersion:true,portalVersion:true}}),
      sessions:await db.platformSession.findMany({where:{userId:id},orderBy:{id:'asc'}})};
  }
  function request(actor,expected){
    return new Request(origin.origin+'/api/platform/account',{method:'POST',
      headers:{Origin:origin.origin,'Content-Type':'application/json',Cookie:sessionCookieFixtureName(origin.origin)+'='+actor.token,'X-Expected-Account':expected},
      body:JSON.stringify({operation:'deactivate-account',currentPassword:password,confirmed:true})});
  }
  // Two unique pairs, no createPortalActor() or test beforeEach limiter reset.
  const a=await owner(),b=await owner(),beforeA=await state(a.id),beforeB=await state(b.id);
  const wrong=await handleAccountRequest(db,request(b,a.id)); const wrongBody=await wrong.json();
  const afterA=await state(a.id),afterB=await state(b.id);
  const unchangedA=JSON.stringify(beforeA)===JSON.stringify(afterA),unchangedB=JSON.stringify(beforeB)===JSON.stringify(afterB);
  const wrongObservation={name:'Original A intent with same-password B session',status:wrong.status,code:wrongBody.code,
    originalUnchanged:unchangedA,replacementUnchanged:unchangedB,replacementDeactivated:!!afterB.user.deactivatedAt,
    setCookieCount:wrong.headers.getSetCookie().length,
    safe:wrong.status===401&&unchangedA&&unchangedB&&wrong.headers.getSetCookie().length===0};
  assert.ok([200,401].includes(wrong.status),'Setup/limiter/credential failure, not the target invariant');
  evidence.cases.push(wrongObservation);
  const c=await owner(),d=await owner(false);
  const heldResponse=await handleAccountRequest(db,request(c,c.id));
  assert.equal(heldResponse.status,200,'Correct-owner deactivation must actually commit');
  // Create the replacement login after commit and before examining the held reply.
  d.token=await loginAccount(db,d.email,password,'Fictional replacement after commit');
  const stateC=await state(c.id),stateD=await state(d.id);
  const sessionC=await readAccountSession(db,c.token),sessionD=await readAccountSession(db,d.token);
  const cookies=heldResponse.headers.getSetCookie();
  const lateObservation={name:'Committed A response after replacement B login',status:heldResponse.status,
    originalDeactivated:!!stateC.user.deactivatedAt,originalSessionRevoked:sessionC===null,
    replacementActive:stateD.user.deactivatedAt===null&&!!sessionD,
    setCookieNames:cookies.map(x=>x.slice(0,x.indexOf('='))),setCookieCount:cookies.length,
    sessionDeletionCookie:cookies.some(x=>x.startsWith(sessionCookieFixtureName(origin.origin)+'=;')&&/Max-Age=0(?:;|$)/.test(x)),
    safe:!!stateC.user.deactivatedAt&&sessionC===null&&stateD.user.deactivatedAt===null&&!!sessionD&&cookies.length===0};
  evidence.cases.push(lateObservation);
  assert.equal(evidence.networkAttempts,0);
  for(const binding of bindings)assert.equal(hash(readFileSync(join(source,binding.path))),binding.sha256,'Source changed');
  evidence.baselineReproductionConfirmed=mode==='baseline'&&wrongObservation.status===200&&wrongObservation.originalUnchanged&&wrongObservation.replacementDeactivated&&lateObservation.originalDeactivated&&lateObservation.originalSessionRevoked&&lateObservation.replacementActive&&lateObservation.sessionDeletionCookie;
  assert.ok(evidence.cases.every(x=>x.safe),'Account actions must preserve original-owner intent and emit no stale cookie deletion');
}catch(error){
  evidence.errors.push({name:error.name,message:String(error.message).slice(0,500)});
  process.exitCode=1;
}finally{
  globalThis.fetch=nativeFetch;
  if(db)await db.$disconnect();
  evidence.recordedAt=new Date().toISOString();
  evidence.outcome=evidence.cases.length===2&&evidence.cases.every(x=>x.safe)&&evidence.errors.length===0?'safe-invariants-passed':evidence.baselineReproductionConfirmed?'baseline-two-invariant-failures-reproduced':'setup-or-unexpected-failure';
  writeFileSync(join(output,'result.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({outcome:evidence.outcome,cases:evidence.cases.length,exitCode:process.exitCode??0,result:join(output,'result.json')}));
}
