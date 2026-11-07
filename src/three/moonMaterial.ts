import * as THREE from 'three';

/**
 * Lunar surface material: one MeshStandardMaterial per globe patch, all sharing
 * the `MoonUniforms` object below.
 *
 * Global:   LROC WAC colour (4K base, 16K tiles streamed per patch) + LOLA normal map.
 * Polar:    poleward of 80.6°S the albedo comes from the LROC WAC South Pole Summer
 *           Mosaic (100 m native; 146 m/px cap texture) and the relief from LOLA
 *           LDEM_80S_80M object-space normals.
 * Detail:   a 204.8 km window around the selected observation point at the
 *           mosaic's native 100 m with matching LOLA normals.
 *
 * Baked shadows: the polar mosaic still contains shadows from its 2010 acquisition.
 * Pixels darker than the shadow threshold carry no albedo information, so they
 * take the regional mean albedo instead; the scene's own (current-epoch) lighting
 * then decides what is dark. Nothing is invented: shape still comes from LOLA.
 *
 * Photometry: direct irradiance blends Lambert with Lommel–Seeliger (lunar-Lambert
 * approximation, McEwen 1991) to avoid unrealistic limb darkening.
 */

export interface MoonUniforms {
  capNormal: { value: THREE.Texture };
  capExtent: { value: number };
  capImg: { value: THREE.Texture };
  capImgOn: { value: number };
  detailImg: { value: THREE.Texture };
  detailNrm: { value: THREE.Texture };
  detailCenter: { value: THREE.Vector2 };
  detailHalf: { value: number };
  detailOn: { value: number };
  fillAlbedo: { value: number };
}

const blank = () => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};

export function createMoonUniforms(capNormal: THREE.Texture, capExtentKm: number): MoonUniforms {
  return {
    capNormal: { value: capNormal },
    capExtent: { value: capExtentKm },
    capImg: { value: blank() },
    capImgOn: { value: 0 },
    detailImg: { value: blank() },
    detailNrm: { value: blank() },
    detailCenter: { value: new THREE.Vector2() },
    detailHalf: { value: 1 },
    detailOn: { value: 0 },
    fillAlbedo: { value: 0.36 },
  };
}

// Latitudes (radians) of the polar blend: fully polar data poleward of INNER,
// global data equatorward of EDGE.
const EDGE = ((-80.6 * Math.PI) / 180).toFixed(6);
const INNER = ((-81.2 * Math.PI) / 180).toFixed(6);

export function createMoonMaterial(opts: {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  uniforms: MoonUniforms;
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: opts.map,
    normalMap: opts.normalMap,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 1,
    metalness: 0,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, opts.uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');

    const header = /* glsl */ `
      #include <common>
      varying vec3 vObjPos;
      uniform sampler2D capNormal; uniform float capExtent;
      uniform sampler2D capImg; uniform float capImgOn;
      uniform sampler2D detailImg; uniform sampler2D detailNrm;
      uniform vec2 detailCenter; uniform float detailHalf; uniform float detailOn;
      uniform float fillAlbedo;
      float gPolarW; vec2 gXY; vec2 gUvCap; vec2 gUvDet; float gDetW;
      void polarSetup() {
        vec3 p = normalize(vObjPos);
        float lat = asin(clamp(p.y, -1.0, 1.0));
        // 1 poleward of INNER, 0 equatorward of EDGE (edge0 < edge1 as GLSL requires).
        gPolarW = 1.0 - smoothstep(${INNER}, ${EDGE}, lat);
        float lon = atan(-p.z, p.x);
        float rho = 2.0 * 1737.4 * tan(0.78539816 + 0.5 * lat);
        gXY = vec2(rho * sin(lon), rho * cos(lon));
        gUvCap = gXY / (2.0 * capExtent) + 0.5;
        gUvDet = (gXY - detailCenter) / (2.0 * detailHalf) + 0.5;
        vec2 e = min(gUvDet, 1.0 - gUvDet);
        gDetW = detailOn * smoothstep(0.0, 0.04, min(e.x, e.y));
      }
      vec3 polarAlbedo(vec3 base, float L) {
        // Baked 2010 shadows carry no albedo: use the regional mean instead.
        float lit = smoothstep(0.012, 0.045, L);
        float a = mix(fillAlbedo, L, lit);
        float lum = max(dot(base, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
        vec3 tint = clamp(base / lum, vec3(0.7), vec3(1.4));
        return tint * a;
      }
    `;

    const albedo = /* glsl */ `
      #include <map_fragment>
      polarSetup();
      if (gPolarW > 0.0) {
        vec3 base = diffuseColor.rgb;
        vec3 cap = polarAlbedo(base, texture2D(capImg, gUvCap).r);
        vec3 pol = mix(base, cap, capImgOn);
        if (gDetW > 0.0) pol = mix(pol, polarAlbedo(base, texture2D(detailImg, gUvDet).r), gDetW);
        diffuseColor.rgb = mix(base, pol, gPolarW);
      }
    `;

    const normals = /* glsl */ `
      #include <normal_fragment_maps>
      if (gPolarW > 0.0) {
        vec3 nObj = texture2D(capNormal, gUvCap).xyz * 2.0 - 1.0;
        if (gDetW > 0.0) nObj = mix(nObj, texture2D(detailNrm, gUvDet).xyz * 2.0 - 1.0, gDetW);
        vec3 nView = normalize((viewMatrix * vec4(normalize(nObj), 0.0)).xyz);
        normal = normalize(mix(normal, nView, gPolarW));
      }
    `;

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', header)
      .replace('#include <map_fragment>', albedo)
      .replace('#include <normal_fragment_maps>', normals);

    const lights = THREE.ShaderChunk.lights_physical_pars_fragment;
    const target = 'vec3 irradiance = dotNL * directLight.color;';
    if (lights.includes(target)) {
      const patched = lights.replace(
        target,
        `float dotNVl = saturate( dot( geometryNormal, geometryViewDir ) );
         float lommel = 2.0 * dotNL / ( dotNL + dotNVl + 1e-4 );
         vec3 irradiance = mix( dotNL, lommel, 0.55 ) * directLight.color;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', patched);
    }
  };
  mat.customProgramCacheKey = () => 'moon-v2';
  return mat;
}
