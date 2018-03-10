(function VectorModule () { // pseudo-module
	
  function Vector(componentsArray) {
    // expect floats/ints
    if ((!("length" in componentsArray)) || componentsArray.length < 0) {
      throw "Vector() expects a components array";
    }
    this.components = componentsArray;
    this.inPlace = false; // default is copy-on-write
  };
  
  Vector.prototype.makeVector = function (newComponents) {
    if (this.inPlace) {
      this.components = newComponents;
      return this;
    }
    else { // copy-on-write
      return new Vector(newComponents);
    }
  };
  
  Vector.prototype.dot = function (otherVector) {
    return this.components
     .map((x, i) => x * otherVector.components[i])
     .reduce((x, p) => x + p);
  };
  
  Vector.prototype.magnitudeSquared = function () {
    return this.dot(this);
  };
  
  Vector.prototype.magnitude = function () {
    return Math.sqrt(this.magnitudeSquared());
  };
  
  Vector.prototype.scale = function (scalingFactor) {
    return this.makeVector(this.components.map(x => x * scalingFactor));
  };
  
  Vector.prototype.unitize = function () {
    return this.scale(this.magnitude());
  };
  
  Vector.prototype.dbgstr = function () {
    return this.components.map(toString).join(", ");
  };
  
  Vector.prototype.add = function (otherVector) {
    if (this.components.length !== otherVector.components.length) {
      throw "dimension error: " + this.components.length + " != " + otherVector.components.length;
    }
    var res = this.components.map((x,i) => x + otherVector.components[i]);
    return this.makeVector(res);
  };
  
  Vector.prototype.floor = function () {
    return this.makeVector(this.components.map(Math.floor));
  };
  
  // exports:
  this.Vector = Vector;

}).apply(this);
