import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
class Store { data=new Map(); get length(){return this.data.size} key(i){return [...this.data.keys()][i]??null} getItem(k){return this.data.get(k)??null} setItem(k,v){this.data.set(k,v)} removeItem(k){this.data.delete(k)} }
test('private activity rejects cross-account delivery and respects consent, retry, withdrawal',async()=>{
 globalThis.localStorage=new Store(); globalThis.sessionStorage=new Store(); globalThis.window=new EventTarget(); globalThis.document={visibilityState:'visible',hasFocus:()=>true};
 process.env.NEXT_PUBLIC_ACTIVITY_ENABLED='true';process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-test';
 let id='user-a', consent=false, fail=false, posted=[];
 globalThis.__activityClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id},access_token:'token-'+id}}})}});
 globalThis.fetch=async(url,init)=>{
   if(url.includes('user_activity_preferences')) return new Response(JSON.stringify([{enabled:consent,changed_at:'2026-09-13T00:00:00Z'}]));
   const data=JSON.parse(init.body);
   if(url.includes('set_activity_enabled')) {consent=data.enabled;return new Response(null,{status:204})}
   if(fail)return new Response(null,{status:503});
   posted.push({token:init.headers.Authorization,events:data.events});
   return new Response(JSON.stringify(data.events.map(e=>e.event_id)));
 };
 let source=readFileSync(new URL('../src/lib/activity.ts',import.meta.url),'utf8').replace('import { installActivityScope } from "./activity-scope"', 'const installActivityScope = () => {}').replace('import { createClient } from "@/lib/supabase/client"','const createClient = globalThis.__activityClient');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const a=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 await a.connectActivity(id);a.recordActivity('feature_viewed','discover');await a.flushActivity();assert.equal(posted.length,0);
 await a.setActivityEnabled(true);a.recordActivity('feature_viewed','discover');fail=true;await a.flushActivity();assert.equal(posted.length,0);fail=false;await a.flushActivity();assert.equal(posted.length,1);
 assert.deepEqual(Object.keys(posted[0].events[0].properties),[]);assert.equal(posted[0].token,'Bearer token-user-a');
 const oldScope=a.activityScope();a.recordActivity('guide_opened','inspire');id='user-b';await a.flushActivity();assert.equal(posted.length,1); // token/user mismatch leaves A data unsent
 a.resetActivity();await a.connectActivity(id);oldScope('guide_opened','inspire');await a.flushActivity();assert.equal(posted.length,1);
 a.recordActivity('guide_opened','inspire','observed',{search:'private text'}); await a.flushActivity(); assert.equal(posted.length,1);
 a.recordActivity('guide_opened','inspire','observed',{entrypoint:'private text'}); await a.flushActivity(); assert.equal(posted.length,1);
 await a.setActivityEnabled(false);a.recordActivity('feature_viewed','discover');await a.flushActivity();assert.equal(posted.length,1);assert.equal(a.activityEnabled(),false);
 assert.equal([...localStorage.data.keys()].filter(k=>k.startsWith("drift.privateActivity")).length,0);
 assert.equal(a.activityOptedOut(),true);
});
