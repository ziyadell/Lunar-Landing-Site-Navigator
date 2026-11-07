import * as THREE from 'three';

/**
 * Lunar surface material.
 *
 * Base: MeshStandardMaterial with the LROC WAC colour mosaic and a tangent-space
 * normal map computed from LOLA (true vertical scale).
 *
 * Two shader patches:
 *  1. South polar cap (poleward of ~80.6°S): the global normal map is replaced by
 *     an object-space normal map built from the 80 m LOLA polar DEM (resampled to
 *     ~290 m), so the landing regions show measured relief, not stretched pixels.
 *  2. Photometry: direct irradiance blends Lambert with Lommel–Seeliger
 *     (a lunar-Lambert approximation, McEwen 1991) so the disc does not show the
 *     strong limb darkening a pure Lambert sphere would.
 */
export function createMoonMaterial(opts: {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  capNormal: THREE.Texture;
  capExtentKm: number;
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: opts.map,
    normalMap: opts.normalMap,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 1,
    metalness: 0,
  });

  const uniforms = {
    capNormal: { value: opts.capNormal },
    capExtent: { value: opts.capExtentKm },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');

    const capSnippet = /* glsl */ `
      #include <normal_fragment_maps>
      {
        vec3 p = normalize(vObjPos);
        float lat = asin(clamp(p.y, -1.0, 1.0));
        const float EDGE = -1.40674;   // -80.6 deg
        const float INNER = -1.41721;  // -81.2 deg
        if (lat < EDGE) {
          float lon = atan(-p.z, p.x);
          float rho = 2.0 * 1737.4 * tan(0.78539816 + 0.5 * lat);
          vec2 uvCap = vec2(rho * sin(lon), rho * cos(lon)) / (2.0 * capExtent) + 0.5;
          vec3 nObj = texture2D(capNormal, uvCap).xyz * 2.0 - 1.0;
          vec3 nView = normalize((viewMatrix * vec4(nObj, 0.0)).xyz);
          normal = normalize(mix(normal, nView, smoothstep(EDGE, INNER, lat)));
        }
      }
    `;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vObjPos;\nuniform sampler2D capNormal;\nuniform float capExtent;',
      )
      .replace('#include <normal_fragment_maps>', capSnippet);

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
  mat.customProgramCacheKey = () => 'moon-v1';
  return mat;
}
