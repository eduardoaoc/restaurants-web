// Builds the single-draw-call "customer" GLBs from the ORIGINAL Quaternius glTF files.
//   node scripts/characters/build-customer-glbs.mjs <input.gltf> <output.glb>
// Why this is lossless here: every material of every used variant has identical PBR parameters
// (metallic 0, roughness 0.5, double-sided, opaque, no textures) and differs only by baseColorFactor.
// So each primitive's colour is baked into COLOR_0 and all primitives are merged into ONE skinned
// primitive with ONE material: 9-13 draw calls and 4-5 skeletons per character become 1 and 1.
// Skeleton (62 joints), skin weights and the kept clips are untouched. Unquantized on purpose:
// quantization adds per-mesh bind compensation that breaks skeleton sharing (Phase 3.1B finding).
import { NodeIO } from '@gltf-transform/core'
import { joinPrimitives, prune } from '@gltf-transform/functions'

const [, , input, output] = process.argv
const KEEP_CLIPS = new Set(['Idle_Neutral', 'Walk'])

const io = new NodeIO()
const doc = await io.read(input)
const root = doc.getRoot()

const skinned = root.listNodes().filter((n) => n.getMesh() && n.getSkin())
if (!skinned.length) throw new Error('no skinned meshes')
const skin = skinned[0].getSkin()
if (skinned.some((n) => n.getSkin() !== skin)) throw new Error('multiple skins: cannot merge safely')

const material = doc.createMaterial('customer').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.5).setMetallicFactor(0).setDoubleSided(true)
const prims = []
for (const node of skinned) {
  if (node.getMatrix().some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) {
    // Skinned node transforms are ignored by glTF; only identity is expected here.
    console.warn(`node ${node.getName()} has a non-identity transform (ignored by glTF skinning)`)
  }
  for (const prim of node.getMesh().listPrimitives()) {
    const base = prim.getMaterial().getBaseColorFactor()
    const count = prim.getAttribute('POSITION').getCount()
    const existing = prim.getAttribute('COLOR_0')
    const colors = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const e = existing ? existing.getElement(i, [1, 1, 1, 1]) : [1, 1, 1, 1]
      for (let c = 0; c < 4; c++) colors[i * 4 + c] = base[c] * (e[c] ?? 1)
    }
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(colors).setBuffer(root.listBuffers()[0]))
    for (const semantic of prim.listSemantics()) {
      if (!['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0', 'COLOR_0'].includes(semantic)) prim.setAttribute(semantic, null)
    }
    prim.setMaterial(material)
    prims.push(prim)
  }
}

const merged = joinPrimitives(prims)
const mesh = doc.createMesh('customer').addPrimitive(merged)
skinned[0].setMesh(mesh).setName('Customer')
for (const node of skinned.slice(1)) node.setMesh(null).setSkin(null)
for (const node of skinned.slice(1)) node.dispose()
for (const old of root.listMeshes()) if (old !== mesh) old.dispose()

for (const anim of root.listAnimations()) if (!KEEP_CLIPS.has(anim.getName())) anim.dispose()
await doc.transform(prune())
await io.write(output, doc)

const out = await io.read(output)
const p = out.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
console.log(output, 'primitives', p.length, 'materials', out.getRoot().listMaterials().length, 'verts', p[0].getAttribute('POSITION').getCount(), 'tris', p[0].getIndices().getCount() / 3, 'clips', out.getRoot().listAnimations().map((a) => a.getName()).join(','))
