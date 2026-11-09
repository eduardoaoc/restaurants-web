import {readGlbFull,accessor} from './acc.mjs';
import * as T from 'three';
const P=process.env.KAYKIT_SIM_GLB||"assets-source/animations/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/Rig_Medium_Simulation.glb";
export function loadSource(){
 const {json:j,bin}=readGlbFull(P); const sk=j.skins[0]; const ibm=accessor(j,sk.inverseBindMatrices,bin);
 const par=new Map(); j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>par.set(c,i)));
 const set=new Set(sk.joints);
 const bones=sk.joints.map((idx,k)=>({idx,name:j.nodes[idx].name,world:new T.Matrix4().fromArray(ibm,k*16).invert(),parentIdx:set.has(par.get(idx))?par.get(idx):null}));
 const by=new Map(bones.map(b=>[b.idx,b]));
 for(const b of bones){const pw=b.parentIdx!=null?by.get(b.parentIdx).world:new T.Matrix4();const l=pw.clone().invert().multiply(b.world);b.p=new T.Vector3();b.q=new T.Quaternion();l.decompose(b.p,b.q,new T.Vector3());b.parent=b.parentIdx!=null?by.get(b.parentIdx).name:null;b.wq=new T.Quaternion().setFromRotationMatrix(b.world);b.wp=new T.Vector3().setFromMatrixPosition(b.world);}
 const clips={};
 for(const a of j.animations){const tr={};for(const c of a.channels){const s=a.samplers[c.sampler];(tr[j.nodes[c.target.node].name]??={})[c.target.path]={t:accessor(j,s.input,bin),v:accessor(j,s.output,bin),interp:s.interpolation||'LINEAR'};}
  clips[a.name]={tracks:tr,duration:Math.max(...Object.values(tr).flatMap(o=>Object.values(o).map(x=>x.t[x.t.length-1])))};}
 return{bones,clips};}
const tmpQ=new T.Quaternion(),tmpQ2=new T.Quaternion();
export function sampleQ(tr,t,out){const{t:ts,v}=tr;let i=0;if(t<=ts[0]){return out.fromArray(v,0);}if(t>=ts[ts.length-1]){return out.fromArray(v,(ts.length-1)*4);}while(ts[i+1]<t)i++;const a=(t-ts[i])/(ts[i+1]-ts[i]);tmpQ.fromArray(v,i*4);tmpQ2.fromArray(v,(i+1)*4);return out.copy(tmpQ).slerp(tmpQ2,a);}
export function sampleV(tr,t,out){const{t:ts,v}=tr;let i=0;if(t<=ts[0])return out.fromArray(v,0);if(t>=ts[ts.length-1])return out.fromArray(v,(ts.length-1)*3);while(ts[i+1]<t)i++;const a=(t-ts[i])/(ts[i+1]-ts[i]);const x=new T.Vector3().fromArray(v,i*3),y=new T.Vector3().fromArray(v,(i+1)*3);return out.copy(x).lerp(y,a);}
// FK: returns Map name->{q,p} world
export function pose(bones,clip,t){const W=new Map();for(const b of bones){const tr=clip.tracks[b.name]||{};const q=tr.rotation?sampleQ(tr.rotation,t,new T.Quaternion()):b.q.clone();const p=tr.translation?sampleV(tr.translation,t,new T.Vector3()):b.p.clone();const pw=b.parent?W.get(b.parent):{q:new T.Quaternion(),p:new T.Vector3()};W.set(b.name,{q:pw.q.clone().multiply(q),p:p.clone().applyQuaternion(pw.q).add(pw.p),lq:q});}return W;}
if(process.argv[1].endsWith('/srcrig.mjs')){const {bones,clips}=loadSource();for(const cn of ['Sit_Chair_Down','Sit_Chair_Idle','Sit_Chair_StandUp']){console.log(cn,clips[cn].duration);for(const t of [0,0.2,0.4,0.6,0.8]){if(t>clips[cn].duration)continue;const W=pose(bones,clips[cn],t);const f=n=>W.get(n).p.toArray().map(v=>+v.toFixed(3)).join(',');console.log(' t',t,'hips',f('hips'),'footL',f('foot.l'),'footR',f('foot.r'),'knee.l',f('lowerleg.l'),'head',f('head'));}}
 const W0=pose(bones,{tracks:{}},0);console.log('bind: hips',W0.get('hips').p.toArray().map(v=>+v.toFixed(3)),'foot.l',W0.get('foot.l').p.toArray().map(v=>+v.toFixed(3)),'toes.l',W0.get('toes.l').p.toArray().map(v=>+v.toFixed(3)));}
