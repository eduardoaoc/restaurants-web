# Customer seating animations (Phase 3.1B)

`men-seating.json` / `women-seating.json` hold three AnimationClips (`Sit_Down`, `Sit_Idle`, `Stand_Up`)
already retargeted to the Quaternius "Ultimate Modular" 62-bone rig (CC0). One file per gender because
the two skeletons have different leg proportions; every outfit of a gender shares the same bind pose.

Source: **KayKit - Character Animations 1.1** by Kay Lousberg, `Rig_Medium_Simulation.glb`
(`Sit_Chair_Down`, `Sit_Chair_Idle`, `Sit_Chair_StandUp`).
- Page: https://kaylousberg.itch.io/kaykit-character-animations (Free 1.1 download)
- Licence: Creative Commons Zero v1.0 (CC0) - "free to use in personal, educational and commercial
  projects" (License.txt inside the pack, verified).

Retargeting is OFFLINE (`scripts/retarget-seating.mjs`); nothing is retargeted at runtime.
Method: per-bone world-space rotation delta (animated world rotation x inverse bind world rotation) applied to
the target bind world rotation; spine split across Abdomen/Torso, hands/fingers from `Idle_Neutral` frame 0;
pelvis (`Body`) position and `Foot.*` bones are solved per frame by forward kinematics so both feet stay planted
on the floor (the KayKit source was authored for a high seat with the feet off the ground).

## Phase 3.1F refinement (baked offline)
`scripts/seating/retarget-seating.mjs <gltf> <out.json> 0.49` additionally (a) lifts the pelvis to the standard chair's seat
height (0.45 m seat + 0.04 m) and re-solves both leg chains with a 2-bone IK so the ankle stays attached to the planted foot
(removes the shin/shoe seam; the runtime pelvis offset is then 0 for the production chair), and (b) rotates the upper arms
outward by the minimum angle that keeps the hands >= 0.2 m from the thigh axis, scaled by how "seated" each frame is.
Nothing is solved at runtime. `seating-alignment.ts` still handles other chair heights (it always hands out clones).
