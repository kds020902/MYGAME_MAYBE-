// GLSL helper shared by shaders that need the terrain height (r) and grass density (g).
export const HEIGHT_SAMPLER_GLSL = /* glsl */ `
uniform sampler2D uHeight;
uniform float uWorldSize;
uniform float uGrid;
vec2 terrainSample(vec2 xz) {
  vec2 g = (xz + uWorldSize * 0.5) / uWorldSize * (uGrid - 1.0);
  if (g.x < 0.0 || g.y < 0.0 || g.x > uGrid - 1.001 || g.y > uGrid - 1.001) return vec2(-9.0, 0.0);
  ivec2 i0 = ivec2(floor(g));
  vec2 f = fract(g);
  vec2 a = texelFetch(uHeight, i0, 0).rg;
  vec2 b = texelFetch(uHeight, i0 + ivec2(1, 0), 0).rg;
  vec2 c = texelFetch(uHeight, i0 + ivec2(0, 1), 0).rg;
  vec2 d = texelFetch(uHeight, i0 + ivec2(1, 1), 0).rg;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;
