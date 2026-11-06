/** Correct inverse-transpose for the rotation × nonuniform-scale instance matrices used by authored floors.
 * PlayCanvas' default instancing normal chunk assumes uniform scale. No art/material colors are changed.
 */
export const instancedNormalChunk = `
attribute vec3 vertex_normal;
vec3 getLocalNormal(vec3 normal) { return normal; }
#if defined(INSTANCING)
mat3 getNormalMatrix(mat4 modelMatrix) {
 vec3 x=modelMatrix[0].xyz, y=modelMatrix[1].xyz, z=modelMatrix[2].xyz;
 return mat3(x/dot(x,x), y/dot(y,y), z/dot(z,z));
}
#else
uniform mat3 matrix_normal;
mat3 getNormalMatrix(mat4 modelMatrix) { return matrix_normal; }
#endif
`;
