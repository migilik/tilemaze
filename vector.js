class Vector {
  constructor(componentsArray) {
    // expect floats/ints
    if ((!("length" in componentsArray)) || componentsArray.length < 0) {
      throw "Vector() expects a components array";
    }
    this.components = componentsArray;
  };
  
  makeVector (newComponents) {
    // thought about supporting an in-place version and wrapping the
    // CoW vs in-place logic here, but it is probably too dangerous
    // to be worth it for the most part, so deleted for now..
    return new Vector(newComponents);
  }
  
  dot (otherVector) {
    return this.components
     .map((x, i) => x * otherVector.components[i])
     .reduce((x, p) => x + p);
  }
  
  magnitudeSquared () {
    return this.dot(this);
  }
  
  magnitude () {
    return Math.sqrt(this.magnitudeSquared());
  }
  
  scale (scalingFactor) {
    return this.makeVector(this.components.map(x => x * scalingFactor));
  }
  
  unitize () {
    return this.scale(this.magnitude());
  }
  
  dbgstr () {
    return this.components.map(toString).join(", ");
  }
  
  add (otherVector) {
    if (this.components.length !== otherVector.components.length) {
      throw "dimension error: " + this.components.length + " != " + otherVector.components.length;
    }
    var res = this.components.map((x,i) => x + otherVector.components[i]);
    return this.makeVector(res);
  }
  
  floor () {
    return this.makeVector(this.components.map(Math.floor));
  }
}

export { Vector };
