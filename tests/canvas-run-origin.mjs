// Executes the pinned, reviewed store module through TypeScript transpilation.
// Real Zustand vanilla store; deterministic fake provider/settings/graph data.
// No browser, Comfy server, GPU, network, credentials or upstream npm scripts.
import {readFile} from 'node:fs/promises';
import {createRequire,stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),dir=args.includes('--deps')?args[args.indexOf('--deps')+1]:path.join(root,'node_modules'),variant='working-tree';
if(!dir)throw Error('Optional --deps requires an existing node_modules directory');
const require=createRequire(path.resolve(dir,'package.json')),{createStore}=require('zustand/vanilla');
const source=await readFile(path.join(root,'src/store/useCanvasStore.ts'),'utf8');
const mentions=await readFile(path.join(root,'src/lib/mentions.ts'),'utf8');
function transpile(code,name){
 let out=stripTypeScriptTypes(code,{mode:'strip',sourceUrl:name}),names=new Set();
 out=out.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g,(_m,bindings,from)=>`const {${bindings}} = require(${JSON.stringify(from)});`);
 out=out.replace(/export\s+(const|let|function)\s+(\w+)/g,(_m,kind,id)=>{names.add(id);return `${kind} ${id}`;});
 out=out.replace(/export\s*\{([^}]+)\};?/g,(_m,ids)=>{ids.split(',').map(s=>s.trim()).filter(Boolean).forEach(id=>names.add(id));return '';});
 if(/^\s*(?:import|export)\s/m.test(out))throw Error('Unreviewed module syntax in '+name);
 return out+'\n'+[...names].map(id=>`exports.${id} = ${id};`).join('\n');
}
const model={id:'sd-turbo',name:'CPU fake provider',family:'image',runtime:'comfyui',blurb:'Contract only',accent:'#fff'};
function setup(){
 const requests=[],cancels=[],storage=new Map(),settings={useComfy:true,connection:'online',installed:{},recordRunTime:()=>{},openConnection:()=>{},openInstall:()=>{}};
 const provider={id:'fake',label:'Deferred CPU fixture',generate:request=>new Promise((resolve,reject)=>requests.push({request,resolve,reject})),cancel:async()=>{cancels.push(true);}};
 const modules={
  '@xyflow/react':{addEdge:()=>{throw Error('Unused graph mutator');},applyEdgeChanges:()=>{throw Error('Unused graph mutator');},applyNodeChanges:()=>{throw Error('Unused graph mutator');}},
  zustand:{create:initializer=>createStore(initializer)},
  '../data':{MODELS:[model],MODEL_BY_ID:{'sd-turbo':model},NODE_META:{},TEMPLATES:[{id:'fixture',name:'Fixture',build:()=>({nodes:[],edges:[]})}],makeEdge:()=>{throw Error('Unused graph builder');}},
  '../lib/providers':{getRuntimeProvider:()=>provider},'../lib/staticDemo':{STATIC_DEMO:false},'./useSettingsStore':{useSettingsStore:{getState:()=>settings}},
 };
 const mod={exports:{}};
 const globals={module:mod,exports:mod.exports,Error,structuredClone,crypto:{randomUUID},console,performance,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>1,clearTimeout:()=>{},require:name=>{if(name==='../lib/mentions'){const m={exports:{}};vm.runInNewContext(transpile(mentions,'mentions.ts'),{module:m,exports:m.exports},{filename:'mentions.cjs'});return m.exports;}if(!(name in modules))throw Error('Unexpected module '+name);return modules[name];}};
 vm.runInNewContext(transpile(source,'useCanvasStore.ts'),globals,{filename:'useCanvasStore.cjs'});
 return {store:mod.exports.useCanvasStore,requests,cancels,storage};
}
const node=(id='shared')=>({id,type:'canvas',position:{x:0,y:0},data:{kind:'model',model:'sd-turbo',title:'Fixture model',prompt:'Original prompt',status:'idle'}});
const doc=(id,nodes=[node()])=>({id,title:'Canvas '+id,updatedAt:0,nodes,edges:[],comments:[]});
function seed(f,aNodes=[node()],bNodes=[node()]){f.store.setState({docs:{A:doc('A',aNodes),B:doc('B',bNodes)},order:['A','B'],activeId:'A',selectedId:null,selectedIds:[],view:'editor',assets:[],versions:[],running:false,runLabel:'',historyPast:[],historyFuture:[]});}
const result=label=>({url:'fixture://'+label,kind:'image',provider:'fake',latencyMs:1,seed:10});
const outcomes=[];
async function check(name,fn){try{await fn();outcomes.push({name,passed:true});}catch(e){outcomes.push({name,passed:false,error:e.message});}}
await check('switching canvases does not route A result or automatic version into same-ID B node',async()=>{
 const f=setup();seed(f);const bBefore=structuredClone(f.store.getState().docs.B),pending=f.store.getState().run('all');assert.equal(f.requests.length,1);f.store.getState().openCanvas('B');f.requests[0].resolve(result('A'));await pending;
 const s=f.store.getState();assert.equal(s.docs.A.nodes[0].data.outputUrl,'fixture://A');assert.deepEqual(s.docs.B,bBefore);assert.equal(s.activeId,'B');assert.equal(s.versions[0]?.docId,'A');
});
await check('an A error after switching remains on A and leaves B unchanged',async()=>{
 const f=setup();seed(f);const bBefore=structuredClone(f.store.getState().docs.B),pending=f.store.getState().run('all');f.store.getState().openCanvas('B');f.requests[0].reject(Error('fixture provider error'));await pending;
 const s=f.store.getState();assert.equal(s.docs.A.nodes[0].data.error,'fixture provider error');assert.deepEqual(s.docs.B,bBefore);
});
await check('cancelling from B clears queued/running states only in originating A; late result is ignored',async()=>{
 const f=setup();seed(f);const pending=f.store.getState().run('all');f.store.getState().openCanvas('B');f.store.getState().updateNodeData('shared',{status:'running'});f.store.getState().cancelRun();f.requests[0].resolve(result('late'));await pending;
 const s=f.store.getState();assert.equal(s.docs.A.nodes[0].data.status,'idle');assert.equal(s.docs.B.nodes[0].data.status,'running');assert.equal(s.docs.A.nodes[0].data.outputUrl,undefined);assert.equal(s.versions.length,0);assert.equal(f.cancels.length,1);
});
await check('same-origin input edits made during generation survive the result patch',async()=>{
 const f=setup();seed(f);const pending=f.store.getState().run('all');f.store.getState().updateNodeData('shared',{prompt:'Edited while rendering',title:'Edited title'});f.requests[0].resolve(result('A'));await pending;
 const s=f.store.getState();assert.equal(s.docs.A.nodes[0].data.prompt,'Edited while rendering');assert.equal(s.docs.A.nodes[0].data.title,'Edited title');assert.equal(s.docs.A.nodes[0].data.outputUrl,'fixture://A');assert.equal(s.versions[0]?.docId,'A');
});
await check('deleting the originating canvas cannot resurrect it or write a same-ID B result',async()=>{
 const f=setup();seed(f);const pending=f.store.getState().run('all');f.store.getState().openCanvas('B');f.store.getState().deleteCanvas('A');f.requests[0].resolve(result('orphan'));await pending;
 const s=f.store.getState();assert.equal(s.docs.A,undefined);assert.equal(s.docs.B.nodes[0].data.outputUrl,undefined);assert.equal(s.versions.length,0);
});
await check('parallel nodes keep both independent results and original per-node History',async()=>{
 const first=node('one');first.data.outputUrl='fixture://old';first.data.outputKind='image';first.data.outputHistory=[{url:'fixture://older',kind:'image',at:1}];const f=setup();seed(f,[first,node('two')]);const pending=f.store.getState().run('all');assert.equal(f.requests.length,2);f.store.getState().openCanvas('B');f.requests[1].resolve(result('two'));f.requests[0].resolve(result('one'));await pending;
 const s=f.store.getState(),one=s.docs.A.nodes.find(n=>n.id==='one'),two=s.docs.A.nodes.find(n=>n.id==='two');assert.equal(one.data.outputUrl,'fixture://one');assert.equal(two.data.outputUrl,'fixture://two');assert.deepEqual(Array.from(one.data.outputHistory,x=>x.url),['fixture://one','fixture://old','fixture://older']);assert.equal(s.versions[0]?.docId,'A');
});
await check('History selections added on the originating node during generation are retained',async()=>{
 const first=node();first.data.outputUrl='fixture://old';first.data.outputKind='image';const f=setup();seed(f,[first]);const pending=f.store.getState().run('all');
 f.store.getState().updateNodeData('shared',{outputUrl:'fixture://selected',outputHistory:[{url:'fixture://added-during-run',kind:'image',at:2}]});f.requests[0].resolve(result('new'));await pending;
 assert.deepEqual(Array.from(f.store.getState().docs.A.nodes[0].data.outputHistory,x=>x.url),['fixture://new','fixture://selected','fixture://added-during-run']);
});
await check('dependent nodes continue reading their origin graph after the user changes canvases',async()=>{
 const f=setup();seed(f,[node('one'),node('two')]);const a=structuredClone(f.store.getState().docs.A);a.edges=[{id:'one-two',source:'one',target:'two'}];f.store.setState({docs:{...f.store.getState().docs,A:a}});
 const pending=f.store.getState().run('all');assert.equal(f.requests.length,1);f.store.getState().openCanvas('B');f.requests[0].resolve(result('upstream'));await new Promise(setImmediate);assert.equal(f.requests.length,2);assert.equal(f.requests[1].request.inputImageUrl,'fixture://upstream');f.requests[1].resolve(result('downstream'));await pending;
 assert.equal(f.store.getState().docs.A.nodes.find(n=>n.id==='two').data.outputUrl,'fixture://downstream');
});
await check('late cancelled run cannot clear or publish over a newer run on another canvas',async()=>{
 const f=setup();seed(f);const old=f.store.getState().run('all');f.store.getState().openCanvas('B');f.store.getState().cancelRun();const next=f.store.getState().run('all');assert.equal(f.requests.length,2);f.requests[0].resolve(result('old-cancelled'));await old;assert.equal(f.store.getState().running,true);assert.equal(f.store.getState().docs.B.nodes[0].data.outputUrl,undefined);f.requests[1].resolve(result('new-B'));await next;
 assert.equal(f.store.getState().docs.A.nodes[0].data.status,'idle');assert.equal(f.store.getState().docs.B.nodes[0].data.outputUrl,'fixture://new-B');assert.equal(f.store.getState().versions[0].docId,'B');
});
await check('origin result does not append render-state snapshots to the currently edited canvas undo stack',async()=>{
 const f=setup();seed(f);const pending=f.store.getState().run('all');f.store.getState().openCanvas('B');f.store.getState().updateNodeData('shared',{prompt:'B manual edit'});const historyBefore=structuredClone(f.store.getState().historyPast);f.requests[0].resolve(result('A'));await pending;
 assert.deepEqual(structuredClone(f.store.getState().historyPast),historyBefore);assert.equal(f.store.getState().docs.B.nodes[0].data.prompt,'B manual edit');
});
const receipt={variant,nodeVersion:process.version,sourceSHA256:createHash('sha256').update(source).digest('hex'),atUTC:new Date().toISOString(),harness:'Actual reviewed upstream store stripped by Node builtin TypeScript support; module bindings adapted to isolated VM; realZustandvanilla; deterministic deferred CPU provider and minimal settings/data only',modelGeneration:false,networkCalls:0,GPUCalls:0,tests:outcomes};
console.log(JSON.stringify(receipt,null,2));if(outcomes.some(t=>!t.passed))process.exitCode=1;
