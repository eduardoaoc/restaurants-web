import fs from 'node:fs';
export function accessor(j,i,glbBin){const a=j.accessors[i];const bv=j.bufferViews[a.bufferView];const buf=j.buffers[bv.buffer];
 let bin; if(buf.uri&&buf.uri.startsWith('data:')) bin=Buffer.from(buf.uri.split(',')[1],'base64'); else bin=glbBin;
 const n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type]; const off=(bv.byteOffset||0)+(a.byteOffset||0);
 const out=new Float32Array(a.count*n); const dv=new DataView(bin.buffer,bin.byteOffset+off,undefined); const stride=bv.byteStride||n*4;
 for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)out[k*n+c]=dv.getFloat32(k*stride+c*4,true); return out;}
export function readGlbFull(f){const b=fs.readFileSync(f);const jl=b.readUInt32LE(12);const json=JSON.parse(b.slice(20,20+jl).toString());const off=20+jl+8;return{json,bin:b.slice(off)};}
