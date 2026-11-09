// Usage: KAYKIT_SIM_GLB=<Rig_Medium_Simulation.glb> node scripts/seating/retarget-seating.mjs <Quaternius .gltf> <out.json>
// (see public/assets/restaurant-3d/characters/animations/README.md)
// Offline retarget: KayKit Rig_Medium sit clips -> Quaternius 62-bone rig (world-space rotation deltas + foot-plant pelvis solve)
import fs from 'node:fs';
import * as T from 'three';
import {loadSource,pose,sampleQ} from './srcrig.mjs';
import {qBind} from './bind.mjs';
const [,, charFile, outFile]=process.argv;
const FPS=30, GROUND_Y_NAME='Foot.L';
const {bones:SB,clips}=loadSource();
const {j,bones:TB}=qBind(charFile);
const tby=new Map(TB.map(b=>[b.name,b]));
// topological order
const order=[];const seen=new Set();const visit=b=>{if(seen.has(b.name))return;if(b.parent)visit(tby.get(b.parent));seen.add(b.name);order.push(b);};TB.forEach(visit);
const I=new T.Quaternion();
const MAP={Hips:['hips'],UpperArmL:null};
const map={ 'Hips':{s:'hips'}, 'Abdomen':{s:'spine',w:.5}, 'Torso':{s:'spine'}, 'Chest':{s:'chest'}, 'Neck':{s:'chest',s2:'head',w:.5}, 'Head':{s:'head'},
 'UpperArm.L':{s:'upperarm.l'},'LowerArm.L':{s:'lowerarm.l'},'Wrist.L':{s:'hand.l'},'UpperArm.R':{s:'upperarm.r'},'LowerArm.R':{s:'lowerarm.r'},'Wrist.R':{s:'hand.r'},
 'UpperLeg.L':{s:'upperleg.l'},'LowerLeg.L':{s:'lowerleg.l'},'Foot.L':{s:'foot.l',flat:true},'UpperLeg.R':{s:'upperleg.r'},'LowerLeg.R':{s:'lowerleg.r'},'Foot.R':{s:'foot.r',flat:true} };
const sbind=new Map(SB.map(b=>[b.name,b]));
// relaxed hand/shoulder pose: frame 0 of Quaternius Idle_Neutral (local rotations)
const idle=j.animations.find(a=>a.name==='Idle_Neutral');
import {accessor} from './acc.mjs';
const idleQ=new Map();for(const c of idle.channels){if(c.target.path!=='rotation')continue;const s=idle.samplers[c.sampler];idleQ.set(j.nodes[c.target.node].name,new T.Quaternion().fromArray(accessor(j,s.output),0));}
const isRelaxed=n=>/^(Shoulder|Index|Middle|Ring|Pinky|Thumb)/.test(n);
const root=tby.get('Root');
const sanitize=n=>T.PropertyBinding.sanitizeNodeName(n);

function solveFrame(clip,t){
  const W=pose(SB,clip,t);
  const delta=new Map();for(const [n,b] of sbind){delta.set(n,W.get(n).q.clone().multiply(b.wq.clone().invert()));}
  const yawOnly=q=>new T.Quaternion().setFromEuler(new T.Euler(0,new T.Euler().setFromQuaternion(q,'YXZ').y,0,'YXZ'));
  const dFor=m=>{const d=delta.get(m.s).clone();if(m.flat)return yawOnly(d);if(m.s2){return delta.get(m.s).clone().slerp(delta.get(m.s2),m.w);}if(m.w)return new T.Quaternion().slerp(d,m.w);return d;};
  const wq=new Map(),lq=new Map(),wp=new Map();
  for(const b of order){
    const pq=b.parent?wq.get(b.parent):I; const pp=b.parent?wp.get(b.parent):new T.Vector3(0,0,0);
    let local;
    if(b.name==='Root')local=new T.Quaternion();
    else if(map[b.name])local=pq.clone().invert().multiply(dFor(map[b.name]).multiply(b.wq));
    else if(isRelaxed(b.name)&&idleQ.has(b.name))local=idleQ.get(b.name).clone();
    else local=b.q.clone();
    lq.set(b.name,local);wq.set(b.name,pq.clone().multiply(local));
    // position (Foot bones fixed up below)
    wp.set(b.name,(b.name==='Root'?root.wp.clone():b.p.clone().applyQuaternion(pq).add(pp)));
  }
  // ankle positions via leg FK (feet are root-parented IK-style bones)
  const ank={};
  for(const side of ['L','R']){const ll=tby.get('LowerLeg.'+side),ft=tby.get('Foot.'+side);const v=ft.wp.clone().sub(ll.wp).applyQuaternion(ll.wq.clone().invert());ank[side]=v.applyQuaternion(wq.get('LowerLeg.'+side)).add(wp.get('LowerLeg.'+side));}
  // pelvis solve: feet keep their standing XZ (mean) and the lowest ankle stays on the ground
  const groundY=tby.get('Foot.L').wp.y;
  const meanX=(ank.L.x+ank.R.x)/2,meanZ=(ank.L.z+ank.R.z)/2;
  const bindMeanZ=(tby.get('Foot.L').wp.z+tby.get('Foot.R').wp.z)/2;
  const off=new T.Vector3(-meanX,groundY-Math.min(ank.L.y,ank.R.y),bindMeanZ-meanZ);
  const body=tby.get('Body');const bodyPos=body.p.clone().add(off); // Body is Root child, Root has identity rotation
  const feet={};for(const s of ['L','R']){const wpA=ank[s].clone().add(off);feet[s]=wpA.sub(root.wp);}
  return{lq,wq,wp,off,ank,bodyPos,feet,hipsW:wp.get('Hips').clone().add(off),kneeY:wp.get('LowerLeg.L').y+off.y,ankleY:[ank.L.y+off.y,ank.R.y+off.y]};
}

// ---- refinement (Phase 3.1F): chair-height pelvis lift with offline 2-bone leg IK, and arm clearance from the thighs ----
// Usage: optional 3rd arg = target pelvis height (m) of the production chair seat (0.45 m + 0.04 m = 0.49).
const PELVIS_Y = process.argv[4] ? parseFloat(process.argv[4]) : null;
const V3=T.Vector3, Q=T.Quaternion;
const clamp01=t=>Math.min(1,Math.max(0,t));
function segDist(p,a,b){const ab=b.clone().sub(a);const t=clamp01(p.clone().sub(a).dot(ab)/ab.lengthSq());return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));}
/** Re-solves thigh/shin so the ankle stays on its planted target while the pelvis is raised by dy. */
function liftPelvis(f,dy){
  f.knee={};f.hip={};
  for(const side of ['L','R']){f.hip[side]=f.wp.get('UpperLeg.'+side).clone().add(f.off);f.knee[side]=f.wp.get('LowerLeg.'+side).clone().add(f.off)}
  if(Math.abs(dy)<1e-6)return;
  f.bodyPos.y+=dy;f.hipsW.y+=dy;
  const bodyW=f.wq.get('Body');
  for(const side of ['L','R']){
    const ul=tby.get('UpperLeg.'+side),ll=tby.get('LowerLeg.'+side);
    const H=f.wp.get('UpperLeg.'+side).clone().add(f.off), K=f.wp.get('LowerLeg.'+side).clone().add(f.off), A=f.ank[side].clone().add(f.off);
    const H2=H.clone().add(new V3(0,dy,0));
    const L1=K.distanceTo(H),L2=A.distanceTo(K);
    let d=A.distanceTo(H2);d=Math.min(Math.max(d,Math.abs(L1-L2)+1e-4),L1+L2-1e-4);
    const axis=A.clone().sub(H2).normalize();
    let pole=K.clone().sub(H2);pole.sub(axis.clone().multiplyScalar(pole.dot(axis)));if(pole.lengthSq()<1e-8)pole.set(0,0,1);pole.normalize();
    const a=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(L1*L1-a*a,0));
    const K2=H2.clone().add(axis.clone().multiplyScalar(a)).add(pole.multiplyScalar(h));
    const q1=new Q().setFromUnitVectors(K.clone().sub(H).normalize(),K2.clone().sub(H2).normalize());
    const thighW=q1.clone().multiply(f.wq.get('UpperLeg.'+side));
    const vAfter=A.clone().sub(K).applyQuaternion(q1).normalize();
    const q2=new Q().setFromUnitVectors(vAfter,A.clone().sub(K2).normalize());
    const shinW=q2.clone().multiply(q1).multiply(f.wq.get('LowerLeg.'+side));
    f.lq.set('UpperLeg.'+side,bodyW.clone().invert().multiply(thighW));
    f.lq.set('LowerLeg.'+side,thighW.clone().invert().multiply(shinW));
    f.knee[side]=K2;f.hip[side]=H2;
    if(process.env.DBG_IK&&side==='L')console.error('IK L dy',dy.toFixed(3),'H',H.toArray().map(v=>v.toFixed(3)),'K',K.toArray().map(v=>v.toFixed(3)),'A',A.toArray().map(v=>v.toFixed(3)),'| H2',H2.toArray().map(v=>v.toFixed(3)),'K2',K2.toArray().map(v=>v.toFixed(3)),'L1',L1.toFixed(3),'L2',L2.toFixed(3),'d',d.toFixed(3));
    void ul;void ll;
  }
}
/** Smallest outward arm rotation (rad, about the world forward axis) that keeps the hands clear of the thighs. */
function armClearance(f,minDist){
  const out={L:0,R:0};
  for(const side of ['L','R']){
    const sign=side==='L'?1:-1;
    const S=f.wp.get('UpperArm.'+side).clone().add(f.off);
    const pts=[f.wp.get('Wrist.'+side).clone().add(f.off),f.wp.get('Middle1.'+side).clone().add(f.off),f.wp.get('LowerArm.'+side).clone().add(f.off)];
    for(let deg=0;deg<=40;deg++){
      const q=new Q().setFromAxisAngle(new V3(0,0,1),sign*deg*Math.PI/180);
      const ok=pts.every(p=>{const r=S.clone().add(p.clone().sub(S).applyQuaternion(q));return segDist(r,f.hip[side],f.knee[side])>=minDist});
      out[side]=sign*deg*Math.PI/180;if(ok)break;
    }
  }
  return out;
}
function applyArms(f,angles,s){
  for(const side of ['L','R']){
    if(!angles[side])continue;
    const q=new Q().slerp(new Q().setFromAxisAngle(new V3(0,0,1),angles[side]),s);
    const up=f.wq.get('UpperArm.'+side),sh=f.wq.get('Shoulder.'+side);
    f.lq.set('UpperArm.'+side,sh.clone().invert().multiply(q.multiply(up)));
  }
}
const OUT=[{src:'Sit_Chair_Down',name:'Sit_Down',loop:false},{src:'Sit_Chair_Idle',name:'Sit_Idle',loop:true},{src:'Sit_Chair_StandUp',name:'Stand_Up',loop:false}];
const clipsOut=[];const report={};
const solved=OUT.map(o=>{const dur=clips[o.src].duration;const n=o.loop?Math.round(dur*FPS):Math.round(dur*FPS)+1;const times=[...Array(n)].map((_,i)=>+(i/FPS).toFixed(5));return{o,dur,n,times,frames:times.map(t=>solveFrame(clips[o.src],t))};});
if(PELVIS_Y!==null){
  const down=solved[0].frames,idle=solved[1].frames[0];
  const standY=down[0].bodyPos.y,seatY=idle.bodyPos.y,seatedHips=idle.hipsW.y;
  const delta=PELVIS_Y-seatedHips;
  const seated=f=>clamp01((standY-f.bodyPos.y)/(standY-seatY));
  // pass 1: lift + IK on every frame; pass 2: arm clearance measured on the seated pose, applied scaled by seatedness
  for(const sc of solved)for(const f of sc.frames)liftPelvis(f,delta*seated(f));
  liftPelvis(idle,0);
  const armAngles=armClearance(solved[1].frames[0],process.env.ARM_CLEARANCE?parseFloat(process.env.ARM_CLEARANCE):0.2);
  console.error('pelvis lift (m):',delta.toFixed(3),' arm clearance (deg) L/R:',(armAngles.L*57.3).toFixed(1),(armAngles.R*57.3).toFixed(1));
  for(const sc of solved)for(const f of sc.frames)applyArms(f,armAngles,seated(f));
}
for(const {o,dur,n,times,frames} of solved){
  const tracks=[];const prev=new Map();
  const duration=o.loop?dur:times[times.length-1];
  const staticT=[0,duration];
  for(const b of order){
    const nm=sanitize(b.name);
    const rot=frames.map(f=>f.lq.get(b.name));
    // sign continuity
    for(let i=0;i<rot.length;i++){if(i>0&&rot[i].dot(rot[i-1])<0)rot[i]=new T.Quaternion(-rot[i].x,-rot[i].y,-rot[i].z,-rot[i].w);}
    const moving=rot.some(q=>q.angleTo(rot[0])>1e-4);
    const rv=moving?rot.flatMap(q=>q.toArray()):[...rot[0].toArray(),...rot[0].toArray()];
    tracks.push({name:nm+'.quaternion',times:moving?times:staticT,values:rv.map(v=>+v.toFixed(5)),type:'quaternion'});
    let pv,pt=staticT;
    if(b.name==='Body'){pt=times;pv=frames.flatMap(f=>f.bodyPos.toArray());}
    else if(b.name==='Foot.L'||b.name==='Foot.R'){pt=times;const s=b.name.slice(-1);pv=frames.flatMap(f=>f.feet[s].toArray());}
    else if(b.name==='Root'){pv=[...root.p.toArray(),...root.p.toArray()];}
    else pv=[...b.p.toArray(),...b.p.toArray()];
    tracks.push({name:nm+'.position',times:pt,values:pv.map(v=>+v.toFixed(5)),type:'vector'});
  }
  clipsOut.push({name:o.name,duration,tracks,uuid:'x',blendMode:2500});
  const f0=frames[0],fl=frames[frames.length-1];
  report[o.name]={frames:n,duration,hips0:f0.hipsW.toArray().map(v=>+v.toFixed(3)),hipsEnd:fl.hipsW.toArray().map(v=>+v.toFixed(3)),bodyEnd:fl.bodyPos.toArray().map(v=>+v.toFixed(3)),kneeYEnd:+fl.kneeY.toFixed(3),ankleYEnd:fl.ankleY.map(v=>+v.toFixed(3)),minBodyZ:Math.min(...frames.map(f=>f.bodyPos.z)).toFixed(3),minHipsY:Math.min(...frames.map(f=>f.hipsW.y)).toFixed(3)};
}
console.log(JSON.stringify(report,null,1));
const sit=report.Sit_Idle;
fs.writeFileSync(outFile,JSON.stringify({seated:{pelvis:sit.hips0,kneeY:sit.kneeYEnd},source:'KayKit Character Animations 1.1 (CC0, Kay Lousberg) Rig_Medium_Simulation',retargeted_to:'Quaternius Ultimate Modular 62-bone rig',fps:FPS,clips:clipsOut.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks}))}));
console.log('bytes',fs.statSync(outFile).size);
