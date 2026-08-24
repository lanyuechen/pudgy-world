import * as THREE from 'three';

/**
 * Exact Unity outline stack (PC_Renderer + Outline Test / M_Outline3).
 *
 * Hull (Shader Graphs_OutlineShader.mat / Outline Test.shadergraph):
 *   extrude  = NormalWS * (_Outline_Thickness / Object.Scale) * (dist / 2)
 *   fade     = discard when pivotDist/2 >= _Fade_Distance
 *   color    = black, Cull Front, ZWrite Off
 *   mat: thickness=0.009, fade=75; Object.Scale = 1 (Unity FBX bake)
 *   JS: extrude dist = per-vertex view depth (avoids far-pivot blowup);
 *       fade dist = object pivot (Unity Object.Position)
 *
 * PP (M_Outline3.mat / Outline PP.shadergraph):
 *   Roberts diagonals on NormalWS + BlitSource (scene color)
 *   edge = saturate(smoothstep(nThresh, 2, nEdge) + smoothstep(cThresh, 2, cEdge))
 *   overlay lerp(scene, black, edge)
 *   JS: world-space normal RT; color edges sample post-SSAO (Unity BlitSource order)
 */
export const OUTLINE = {
  hull: {
    /** Mesh inverted-hull (Unity material slot [1]) */
    enabled: false,
    /** Unity Shader Graphs_OutlineShader.mat _Outline_Thickness */
    thicknessM: 0.009,
    /** Unity _Fade_Distance */
    fadeDistanceM: 75,
    /** Unity _Outline_Color */
    color: new THREE.Color(0x000000),
    /** Unity Divide(distance, 2) */
    distanceScale: 0.5,
  },

  pp: {
    /** Unity M_Outline3.mat _Outline_Thickness (pixels) */
    thickness: 0.5,
    /** Unity _Normal_Threshold */
    normalThreshold: 0.7,
    /** Unity _Color_Threshold */
    colorThreshold: 0.9,
    /** Unity _Color_Outline */
    color: new THREE.Color(0x000000),
    /** Unity _OVERLAY keyword */
    overlay: true,
  },

  ssao: {
    intensity: 0.4,
    radius: 0.3,
  },
};
