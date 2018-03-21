// eg: range(5) => [0, 1, 2, 3, 4]
function range (x) {
  var result = [];
  for (var i = 0; i < x; i++) { result.push(i); }
  return result;
}

// All possible pairs [a, b] such that a in A and b in B.
// Ordering of pairs is undefined and should not be relied on.
// eg: cartesianProduct([1,2], [4,5]) => [ [1,4], [1,5], [2,4], [2,5] ]
function cartesianProduct (A, B) {
  return A.map(a => B.map(b => [a, b]))
  .reduce((x, p) => p.concat(x), []);
}

function hasValue (x) { return !(x === null || x === undefined); }

function intersectEntitySets (A, B) { // TODO: bit of a misnomer
  return cartesianProduct(A, B)
  .filter(entityPair => entityPair[0] === entityPair[1])
  .map(entityPair => entityPair[0]);
};

// linear interpolation of a scalar from value x0 to value x1 based on
// a parameter t (usually on [0, 1]
function lerp (x0, x1, t) {
  const interval = x1 - x0;
  return x0 + interval * t;
}

export { range, cartesianProduct, hasValue, intersectEntitySets, lerp };
