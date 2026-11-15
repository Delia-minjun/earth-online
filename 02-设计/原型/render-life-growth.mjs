// Local prototype screenshot + interaction checks. No business server or real data.
// Run with Node >=22: node render-life-growth.mjs
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root=dirname(fileURLToPath(import.meta.url));
const profile=await mkdtemp(join(tmpdir(),'earth-growth-prototype-'));
const chrome=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check',
 '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let browserError='';chrome.stderr.on('data',chunk=>{browserError+=chunk.toString()});
let ws,nextId=0;
const pending=new Map(),errors=[];
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++nextId;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method))},10000);pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}});ws.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function until(fn){const limit=Date.now()+15000;while(Date.now()<limit){if(await fn())return;await delay(75)}throw new Error('Timed out waiting for local Chrome')}
const click=s=>evaluate(`document.querySelector(${JSON.stringify(s)}).click()`);
const keepAlive=setInterval(()=>{},1000);
try{
 let port;
 await until(async()=>{try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];return true}catch{return false}});
 console.log('Opening local Chrome debugger');
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT',signal:AbortSignal.timeout(8000)})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('WebSocket connection timed out')),8000);ws.onopen=()=>{clearTimeout(t);resolve()};ws.onerror=e=>{clearTimeout(t);reject(e)}});
 ws.onclose=()=>{for(const p of pending.values())p.reject(new Error('Chrome debugger disconnected'));pending.clear()};
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error(JSON.stringify(m.error)));else p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)};
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1200,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:pathToFileURL(join(root,'04-生活成长-桌面.html')).href});
 await until(()=>evaluate(`document.readyState==='complete' && document.querySelectorAll('.reward').length===6`));
 await evaluate('document.fonts.ready');
 assert.equal(await evaluate(`document.querySelector('.brand img').naturalWidth>0`),true,'existing brand icon loads');
 assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,'no desktop horizontal overflow');
 await click('[data-action="tasks"]');await click('[data-complete="1"]');
 assert.equal(await evaluate('state.balance'),92,'action earns 6 coins');
 assert.equal(await evaluate(`state.areas.find(a=>a.id==='study').xp`),105,'action earns 20 XP');
 await click('[data-complete="1"]');assert.equal(await evaluate('state.balance'),92,'no duplicate reward');
 await click('[data-mode="light"]');await click('[data-complete="3"]');
 assert.equal(await evaluate('state.balance'),95,'minimum version earns 3 coins');
 assert.equal(await evaluate(`state.areas.find(a=>a.id==='finance').xp`),60,'minimum version earns 10 XP');
 await click('[data-action="close"]');
 await click('[data-redeem="1"]');await click('[data-confirm-redeem="1"]');
 assert.equal(await evaluate('state.balance'),75,'redeem deducts once');
 assert.equal(await evaluate('state.spent'),75,'redeem does not create actual expense');
 const claim=await evaluate('state.claims[0].id');
 await click(`[data-cancel="${claim}"]`);await click(`[data-confirm-cancel="${claim}"]`);
 assert.equal(await evaluate('state.balance'),95,'cancel returns original price');
 const beforeXP=await evaluate('state.areas.reduce((sum,a)=>sum+a.xp,0)');
 await click('[data-experience="101"]');await click('[data-confirm-experience="101"]');
 assert.equal(await evaluate('state.balance'),95,'experience gives no coins');
 assert.equal(await evaluate('state.areas.reduce((sum,a)=>sum+a.xp,0)'),beforeXP,'experience gives no XP');
 await click('[data-action="budget"]');await evaluate(`document.querySelector('#budget-input').value=120`);await click('[data-action="save-budget"]');
 await click('[data-tab="all"]');await click('[data-redeem="1"]');
 assert.equal(await evaluate(`document.querySelector('[data-confirm-redeem="1"]').disabled`),true,'budget restriction independent of coins');
 await click('[data-action="close"]');await click('[data-action="reset"]');
 assert.equal(await evaluate(`document.querySelector('[data-redeem="6"]').disabled`),true,'unaffordable reward disabled');
 await click('[data-area="health"]');
 await evaluate(`document.querySelector('#modal').dispatchEvent(new Event('cancel',{cancelable:true}))`);
 assert.equal(await evaluate(`document.querySelector('#modal').open`),false,'Escape handler closes dialog');
 await click('[data-action="add"]');
 await evaluate(`document.querySelector('#reward-name').value='<b>快乐</b>'`);await click('[data-action="save-reward"]');
 assert.equal(await evaluate(`document.querySelectorAll('.reward-title b').length`),0,'custom reward names escaped');
 await click('[data-action="reset"]');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'no mobile horizontal overflow');
 await click('[data-action="tasks"]');
 assert.equal(await evaluate(`document.querySelector('#modal').getBoundingClientRect().width<=innerWidth`),true,'drawer fits mobile');
 await click('[data-action="close"]');
 await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1200,deviceScaleFactor:1,mobile:false});
 await evaluate(`document.querySelector('#toast').hidden=true;window.scrollTo(0,0)`);
 await delay(150);
 const height=await evaluate('document.documentElement.scrollHeight');
 // Capture the complete composition if platform font metrics make it taller.
 const imageHeight=Math.max(1200,height);
 if(imageHeight!==1200)await send('Emulation.setDeviceMetricsOverride',{width:1600,height:imageHeight,deviceScaleFactor:1,mobile:false});
 const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 const output=join(root,'04-生活成长-桌面.png');await writeFile(output,Buffer.from(screenshot.data,'base64'));
 assert.deepEqual(errors,[],'no browser runtime exceptions');
 console.log(JSON.stringify({checks:'passed',desktop:{width:1600,height:imageHeight},mobile:{width:390,horizontalOverflow:false},output},null,2));
}catch(error){console.error(browserError.slice(-3000));throw error}finally{
 if(ws){await send('Browser.close').catch(()=>{});ws.close()}
 chrome.kill();clearInterval(keepAlive);
 // Only remove the uniquely created browser profile inside the OS temp dir.
 await delay(250);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
