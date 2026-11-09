import fs from 'node:fs'; import {accessor} from './acc.mjs';
import * as T from 'three';
export function qBind(file){
 const j=JSON.parse(fs.readFileSync(file,'utf8')); const sk=j.skins[0]; const ibm=accessor(j,sk.inverseBindMatrices);
 const par=new Map(); j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>par.set(c,i)));
 const set=new Set(sk.joints);
 const bones=sk.joints.map((idx,k)=>{const w=new T.Matrix4().fromArray(ibm,k*16).invert();return{idx,name:j.nodes[idx].name,parentIdx:set.has(par.get(idx))?par.get(idx):null,world:w};});
 const byIdx=new Map(bones.map(b=>[b.idx,b])); const res=[];
 for(const b of bones){const p=b.parentIdx!=null?byIdx.get(b.parentIdx).world:new T.Matrix4();b.local=p.clone().invert().multiply(b.world);const P=new T.Vector3(),Q=new T.Quaternion(),S=new T.Vector3();b.local.decompose(P,Q,S);b.p=P;b.q=Q;b.s=S;b.parent=b.parentIdx!=null?byIdx.get(b.parentIdx).name:null;b.wp=new T.Vector3().setFromMatrixPosition(b.world);b.wq=new T.Quaternion().setFromRotationMatrix(b.world);}
 // armature world (nodes above skeleton)
 let anc=[];let p=par.get(sk.joints.find(i=>!set.has(par.get(i))));while(p!==undefined){anc.push(j.nodes[p].name+JSON.stringify({t:j.nodes[p].translation,r:j.nodes[p].rotation,s:j.nodes[p].scale}));p=par.get(p);}
 return{j,bones,anc};}
if(process.argv[1].endsWith('/bind.mjs')){const {bones,anc}=qBind(process.argv[2]);console.log('ancestors',anc);const only=new Set(['Root','Body','Hips','Abdomen','Torso','Chest','Neck','Head','Shoulder.L','UpperArm.L','LowerArm.L','Wrist.L','UpperLeg.L','LowerLeg.L','Foot.L','PT.L','UpperLeg.R','LowerLeg.R','Foot.R','Index1.L','Thumb1.L']);
 for(const b of bones)if(only.has(b.name))console.log(b.name.padEnd(11),'par',String(b.parent).padEnd(8),'wpos',b.wp.toArray().map(v=>+v.toFixed(3)).join(','),'wq',b.wq.toArray().map(v=>+v.toFixed(2)).join(','),'lq',b.q.toArray().map(v=>+v.toFixed(2)).join(','));}
