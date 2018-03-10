(function TileMaze () { // pseudo-module:  TODO: architecture + break-up
  // client html should do:
  //  $(ready);
  //  $(window).on("load", onWindowLoaded);
  // Former hook starts app init on DOM-ready, and
  // later is to resolve a promise that is used to block
  // eg first redraw until the viewport svg is actually loaded.
  this.windowLoaded = $.Deferred();
  this.onWindowLoaded = function () { windowLoaded.resolve(); };
  
  this.tilePixelWidth = 30;
  this.numTilesX = 20;
  this.numTilesY = 15;
  this.viewWidth = this.tilePixelWidth * this.numTilesX;
  this.viewHeight = this.tilePixelWidth * this.numTilesY;
  this.gamestate = null;
  this.svgNS = "http://www.w3.org/2000/svg";
  
  // arbitrary camera transform setting the "center" of the screen
  // relative to top left, in number of tiles.. this needs to be
  // done a better way.
  this.cameraFocusX = 11;
  this.cameraFocusY = 6;

  // eg: range(5) => [0, 1, 2, 3, 4]
  function range (x) {
    var result = [];
    for (var i = 0; i < x; i++) { result.push(i); }
    return result;
  };

  // All possible pairs [a, b] such that a in A and b in B.
  // Ordering of pairs is undefined and should not be relied on.
  // eg: cartesianProduct([1,2], [4,5]) => [ [1,4], [1,5], [2,4], [2,5] ]
  function cartesianProduct (A, B) {
    return A.map(a => B.map(b => [a, b]))
    .reduce((x, p) => p.concat(x), []);
  };
  
  function hasValue (x) { return !(x === null || x === undefined); }

  function GameState () {
    this.counter = 0;
    this.level = null;
    this.byX = new Map();
    this.byY = new Map();
    this.byType = new Map();
  };
  
  // used by addEntity: build lookup indices for game entities by relevant keys
  function addToIndex (index, key, entity) {
    if (!hasValue(key)) { throw "invalid key: " + toString(key); }
    if (!index.has(key)) { index.set(key, new Set()); }
    index.get(key).add(entity);
  };
  
  // opposite of addToIndex
  function removeFromIndex (index, key, entity) {
    if (!index.has(key)) { return; }
    if (!index.get(key).has(entity)) { return; }
    index.get(key).delete(entity);
  };
  
  // all elements of index at key
  function all (index, key) {
    if (index.has(key)) { return Array.from(index.get(key).keys()); }
    return [];
  };
  
  // exactly one element of index at key, or exception
  function one (index, key) {
    var elements = all(index, key);
    if (elements.length !== 1) { throw "key " + key + " does not store exactly one value (actual: " + elements.length + ")"; }
    return elements[0];
  };
  
  // the keys subject to indexing in gamestate.byType (these are property names of entities)
  this.typeFlagsToIndex = [ "player", "wall", "floor", "exit", "goal", "levelBound", "key", "lock" ];
  
  // 'add' entity to gamestate by registering entity in various indices
  // the gamestate uses to look up relevant entities
  // (eg by tile position or type).
  // Positions are not required to be tile-aligned, but a per-entity
  // tileCover is used to understand which tiles "bound" the area of
  // the entity.
  // Do not forget removeEntity when done, or before data gets stale
  // (eg to update position of an entity, first remove it, then update x/y,
  // then re-add it - this is not ideal, and this design could use 
  // improvement (TODO - see also moveEntity function))
  function addEntity (gamestate, entity) {
    entity.tileCover.map(a => a.components).forEach((xy) => {
      if (hasValue(xy[0])) { addToIndex(gamestate.byX, xy[0], entity); }
      if (hasValue(xy[1])) { addToIndex(gamestate.byY, xy[1], entity); }
    });
    var typeFlags = typeFlagsToIndex.filter(typeFlag => typeFlag in entity);
    typeFlags.forEach(typeKey => addToIndex(gamestate.byType, typeKey, entity));
  };

  function removeEntity (gamestate, entity) {
    entity.tileCover.map(a => a.components).forEach((xy) => {
      removeFromIndex(gamestate.byX, xy[0], entity);
      removeFromIndex(gamestate.byY, xy[1], entity);
    });
    var typeFlags = typeFlagsToIndex.filter(typeFlag => typeFlag in entity);
    typeFlags.forEach(typeKey => removeFromIndex(gamestate.byType, typeKey, entity));
  };
  
  // see comment for addEntity - shortcut method for updating position
  function moveEntity (gamestate, entity, newXY, newTileCover) {
    removeEntity(gamestate, entity);
    entity.x = newXY.components[0];
    entity.y = newXY.components[1];
    entity.tileCover = newTileCover;
    addEntity(gamestate, entity);
  };

  function intersectEntitySets (A, B) {
    return cartesianProduct(A, B)
    .filter(entityPair => entityPair[0] === entityPair[1])
    .map(entityPair => entityPair[0]);
  };

  function ready () {
    hintText("Loading.. please wait...");
	
    Promise.resolve()
    .then(loadResources)
    .then(waitForView)
    .then(bindControls)
    .then(startGame)
    .then(draw);
  };

  function loadResources () {
    // put async external resource loading logic here if needed
    return;
  };

  function bindControls () {
    // seems we need both of these for keyboard handling to work through
    // the view svg, but the behavior appears a little odd..
    // TODO investigate further
    $(window).on("keydown", keyPress);
    //$("#view").on("keydown", keyPress);
  };
  
  function waitForView () {
    return windowLoaded; // can not guarantee svg access until svg loads
  };

  function startGame () {
    var gamestate = new GameState();
    this.gamestate = gamestate;
    var player = {
      player: true, svg: "smiles", x: null, y: null, r:0.5, tileCover: [],
      runspeed: 0.25, keys: new Set(), recentEntrance: null
    };
    addEntity(gamestate, player);
    moveToLevel(gamestate, testLevel1, "spawn");
    return gamestate;
  };
  
  function moveToLevel (gamestate, levelData, entranceName) {
	  var player = one(gamestate.byType, "player");
	
	  all(gamestate.byType, "levelBound")
     .forEach(e => removeEntity(gamestate, e));
	
	  var level = loadLevel(levelData);
	  gamestate.level = level;
	  level.tiles.forEach(function (tile, i) {
	    addEntity(gamestate, tile);
	    if ("spawner" in tile) {
		    var doSpawn = true;
        var spawnerType = tile.spawner;
        // TODO: this is too simplistic. really need a event/trigger
        // system for level scripting.. just a bandaid to test whether
	      // key and lock work
	      if (spawnerType === "key" && player.keys.has("testkey")) { doSpawn = false; }
	      var spawnedEntity = {
          svg: spawnerType, levelBound: true, x: tile.x, y: tile.y, 
          tileCover: [ new Vector([tile.x, tile.y]) ]
        };
		    if (doSpawn) {
	        spawnedEntity[spawnerType] = true;
	        addEntity(gamestate, spawnedEntity);
	      }
      }
    });
    var spawnEntity = level.entrances[entranceName];
    var spawnPoint = new Vector([spawnEntity.x, spawnEntity.y]);
    player.recentEntrance = entranceName;
    moveEntity(gamestate, player, spawnPoint, [ spawnPoint ]);
  };

  function keyPress (e) {
    var keyCode = e.keyCode;
    if (keyCode == 40) { tryMove([0, 1]); }
    if (keyCode == 38) { tryMove([0, -1]); }
    if (keyCode == 39) { tryMove([1, 0]); }
    if (keyCode == 37) { tryMove([-1, 0]); }
  };
  
  function intersectCircleVsGrid(center, radius) {
    // TODO: actually check if intersecting other boxes!
    return [ center.floor() ]; 
  };
  
  function tryMove(heading) {
    var gamestate = this.gamestate;
    if (!gamestate) { return; }
    var player = one(gamestate.byType, "player");
    
    var newXY = (new Vector(heading))
     .unitize()
     .scale(player.runspeed)
     .add(new Vector([player.x, player.y]));
    
    var newTileCover = intersectCircleVsGrid(newXY, player.r);
    var entitiesAtDestination = newTileCover
    .map(a => a.components)
    .map((xy) => {
      var atX = all(gamestate.byX, xy[0]);
      var atY = all(gamestate.byY, xy[1]);
      return intersectEntitySets(atX, atY);
    })
    .reduce((a,b) => a.concat(b), []);
    
    // walls block even moves to goals, etc., but having a floor
    // is a pre-requisite for a normal move  
    
    var exitTiles = entitiesAtDestination.filter(e => "exit" in e);
    if (hasValue(player.recentEntrance)) {
      var excluded = gamestate.level.entrances[player.recentEntrance];
      exitTiles = exitTiles
      .filter(e => e.x !== excluded.x && e.y != excluded.y);
    }
    
    var hasFloor = (entitiesAtDestination.filter(e => "floor" in e).length > 0);
    var hasWall = (entitiesAtDestination.filter(e => "wall" in e).length > 0);
    var hasGoal = (entitiesAtDestination.filter(e => "goal" in e).length > 0);
    var hasKey = (entitiesAtDestination.filter(e => "key" in e).length > 0);
    var hasLock = (entitiesAtDestination.filter(e => "lock" in e).length > 0);
    var hasExit = (exitTiles.length > 0);
    
    var moveHintText = "";
    var allowMove = hasFloor;
    
    if (hasWall) { moveHintText = "BONK"; allowMove = false; }
    if (hasGoal) { moveHintText = "Found the glowing thing! Winner!"; }
    
    // TODO: currently assumes only one key-lock pair "testkey"
    // in existence (proof-of-concept):
    if (hasLock) {
      if (player.keys.has("testkey")) {
        removeEntity(gamestate, one(gamestate.byType, "lock"));
      }
      else {
        moveHintText = "BONK! Need a key..."; allowMove = false;
      }
    }
    if (hasKey) {
      player.keys.add("testkey");
      removeEntity(gamestate, one(gamestate.byType, "key"));
      moveHintText = "Got the key.";
    }
    
    if (hasExit) {
      var exit = exitTiles[0].exit;
      var levelName = gamestate.level.name;
      if (exit.split(".").length == 2) { // cross-level exits use "level.exit" notation
        levelName = exit.split(".")[0];
        exit = exit.split(".")[1];
      }
      
      var levelJson = levelJsons[levelName];
      moveToLevel(gamestate, levelJson, exit);
      draw(gamestate);
      return;
    }
    
    if (!hasFloor) { hintText("No floor there.. scary."); allowMove = false; }
    
    if (allowMove) {
      moveEntity(gamestate, player, newXY, newTileCover);
      if (hasValue(player.recentEntrance)) {
        var entranceTile = gamestate.level.entrances[player.recentEntrance];
        var matchingTiles = newTileCover
        .filter((t) => {
          var bx = t.components[0] === entranceTile.x;
          var by = t.components[1] === entranceTile.y;
          return (bx && by);
        });
        if (matchingTiles.length === 0) { player.recentEntrance = null; }
      }
    }
    hintText(moveHintText);
    draw(gamestate);
  };
  
  function svgAmongEntities(svg, entities) {
    return (entities.filter(e => e.svg === svg).length > 0);
  };
  
  function makeSvgNode (href, x, y) {
    var svgUse = document.createElementNS(svgNS, "use");
    svgUse.setAttribute("href", href);
    var xformStr = "translate(X,Y)".replace("X", x).replace("Y", y);
    svgUse.setAttribute("transform", xformStr);
    return svgUse;
  };
  
  function updateCameraPosition (gamestate, svgCamera) {
    var player = one(gamestate.byType, "player");
    var camX = cameraFocusX - player.x;
    var camY = cameraFocusY - player.y;
    var newTransformStr = "translate(X, Y)".replace("X", camX).replace("Y", camY);
    svgCamera.attr("transform", newTransformStr);
  };

  function draw (gamestate) {
    // need to pass contentDocument as context to JQuery for
    // svg element manipulation to work right when using external svg:
    var view = $("#view");
    var svgContentDocument = view[0].contentDocument;
    var scene = $("#scene", svgContentDocument);
    var svgCamera = $("#cameraoffset", svgContentDocument);
	
    scene.empty();
    updateCameraPosition(gamestate, svgCamera);
    
    // TODO instead of a hardcoded render order by svg name, put a z index into tileData.
    var renderOrder = ["floor", "cake", "spawn", "bricks", "stairs", "key", "lock", "glowycircle", "smiles"];
    
    range(this.numTilesY).forEach(function (y) {
      range(this.numTilesX).forEach(function (x) {
        var atX = all(gamestate.byX, x);
        var atY = all(gamestate.byY, y);
        var entities = intersectEntitySets(atX, atY);
        var svgsToRender = renderOrder.filter(svg => svgAmongEntities(svg, entities));
        var svg = svgsToRender.slice(-1, svgsToRender.length)[0]; // uppermost only
        
        if (svg) {
          var svgNode = makeSvgNode("viewport.svg#" + svg, x, y);
          scene.append($(svgNode));
        }
      });
    });
  };
  
  
  // display text to indicate what is going on when visual and other
  // cues have not yet been sufficiently developed.
  // this is intended mostly for use with in-dev features as animations,
  // sounds, etc., are a preferable way to indicate what is happening.
  function hintText (text) {
    $("#hinttext").empty().append("<span>TEXT</span>".replace("TEXT", text));
  };

  // fields allowed in tile data of json level data format - these fields will get
  // copied into loaded level data.  could eventually put validation rules here too..
  this.validTileDataFields = [ "floor", "wall", "goal", "entrance", "exit", "svg", "spawner" ];
  
  function loadLevel (levelJson) {
    hintText("Now entering " + levelJson.name + " ... ");
	  // from json data format to in-memory format with tile mappings already applied
	  var level = {
	    name: levelJson.name,
	    tiles: [],
	    entrances: {}
	  };
    levelJson.tileData.split('\n').forEach(function (rowStr, rowNum) {
      rowStr.split('').forEach(function (char, colNum) {
		    if (!(char in levelJson.tileDataMap)) {
	        throw "character " + char + " in tile data not found in tile data map";
	      }
        var tileData = levelJson.tileDataMap[char];
        var levelTile = {
		      x: colNum,
		      y: rowNum,
          tileCover: [ new Vector([ colNum, rowNum ]) ],
		      levelBound: true, // these get removed when moving to a different level
		      sourceStr: levelJson.name + "[" + colNum + ", " + rowNum + "]" // debug/diagnostic
        };
        
		    validTileDataFields
        .filter(field => field in tileData)
		    .forEach(field => levelTile[field] = tileData[field]);
		
        if ("entrance" in tileData) {
		      if (tileData.entrance in level.entrances) {
		        throw "duplicate entrance name " + tileData.entrance + " in level data";
		      }
		      level.entrances[tileData.entrance] = levelTile;
		    }
		    level.tiles.push(levelTile);
      });
    });
    return level;
  };
  
  
  // use format that can easily be imported from a JSON file
  // so that later (TODO) can move 
  this.testLevel1 = {
    name: "testLevel1",
    tileDataMap: {
      ".": { floor: true, svg: "floor",  },
      " ": { svg: "blackbox" },
      "1": { wall: true, svg: "bricks" },
      "2": { entrance: "spawn", floor: true, svg: "floor" },
      "3": { goal: true, floor: true, svg: "glowycircle" },
      "4": { floor: true, entrance: "stairs1", exit: "testLevel2.stairs1", svg: "stairs" },
      "5": { floor: true, entrance: "stairs1", exit: "testLevel1.stairs1", svg: "stairs" },
      "6": { floor: true, entrance: "stairs2", exit: "testLevel2.stairs2", svg: "stairs" },
      "7": { floor: true, entrance: "stairs2", exit: "testLevel1.stairs2", svg: "stairs" },
      "8": { floor: true, spawner: "key", svg: "floor" },
      "9": { floor: true, spawner: "lock", svg: "floor" },
      "a": { floor: true, entrance: "stairs3", exit: "testLevel2.stairs3", svg: "stairs" },
      "b": { floor: true, entrance: "stairs3", exit: "testLevel1.stairs3", svg: "stairs" },
    },
    tileData: [
      " 111        111 ",
      "11.11      11.11",
      "12.41      16.31",
      "11.11      11.11",
      " 11111111111111 ",
      " 1...a........1 ",
      " 1........8...1 ",
      " 1............1 ",
      " 11111111111111 "
    ].join("\n")
  };
  
  this.testLevel2 = {
    name: "testLevel2",
    tileDataMap: testLevel1.tileDataMap,
    tileData: [
      " ",
      "  111111111111",
      "  15....9...71",
      "  111.11111111",
      "    1.1",
      "    1b1",
      "    111"
    ].join("\n")
  };
  
  this.levelJsons = {
    "testLevel1" : testLevel1,
    "testLevel2" : testLevel2
  };
  
  
  function Vector(componentsArray) {
    // expect floats/ints
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
  this.ready = ready;
  this.onWindowLoaded = onWindowLoaded;

}).apply(this);
