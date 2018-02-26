(function () {
  this.tilePixelWidth = 30;
  this.numTilesX = 20;
  this.numTilesY = 15;
  this.viewWidth = this.tilePixelWidth * this.numTilesX;
  this.viewHeight = this.tilePixelWidth * this.numTilesY;
  this.gamestate = null;

  // eg: range(5) => [0, 1, 2, 3, 4]
  this.range = function (x) {
    var result = [];
    for (var i = 0; i < x; i++) { result.push(i); }
    return result;
  };

  // All possible pairs [a, b] such that a in A and b in B.
  // Ordering of pairs is undefined and should not be relied on.
  // eg: cartesianProduct([1,2], [4,5]) => [ [1,4], [1,5], [2,4], [2,5] ]
  this.cartesianProduct = function (A, B) {
    return A.map(a => B.map(b => [a, b]))
    .reduce((x, p) => p.concat(x), []);
  };
  
  this.hasValue = function (x) { return !(x === null || x === undefined); }

  this.newGameState = function () {
    var gs = {
      counter: 0,
      level: null,
      byX: new Map(),
      byY: new Map(),
      byType: new Map()
    };
    return gs;
  };
  
  // used by addEntity: build lookup indices for game entities by relevant keys
  this.addToIndex = function (index, key, entity) {
	if (!hasValue(key)) { throw "invalid key: " + toString(key); }
    if (!index.has(key)) { index.set(key, new Set()); }
    index.get(key).add(entity);
  };
  
  // opposite of addToIndex
  this.removeFromIndex = function(index, key, entity) {
	if (!index.has(key)) { return; }
	if (!index.get(key).has(entity)) { return; }
	index.get(key).delete(entity);
  };
  
  // all elements of index at key
  this.all = function(index, key) {
    if (index.has(key)) { return Array.from(index.get(key).keys()); }
    return [];
  };
  
  // exactly one element of index at key, or exception
  this.one = function(index, key) {
	var elements = all(index, key);
	if (elements.length !== 1) { throw "key " + key + " does not store exactly one value (actual: " + elements.length + ")"; }
	return elements[0];
  };
  
  // the keys subject to indexing in gamestate.byType (these are property names of entities)
  this.typeFlagsToIndex = [ "player", "wall", "floor", "exit", "goal", "levelBound" ];
  
  // 'add' entity to gamestate by registering entity in various indices
  // the gamestate uses to look up relevant entities
  // (eg by tile position or type).
  // Do not forget removeEntity when done, or before data gets stale
  // (eg to update position of an entity, first remove it, then update x/y,
  // then re-add it - this is not ideal, and this design could use 
  // improvement (TODO - see also moveEntity function))
  this.addEntity = function (gamestate, entity) {
    if (hasValue(entity.x)) { addToIndex(gamestate.byX, entity.x, entity); }
    if (hasValue(entity.y)) { addToIndex(gamestate.byY, entity.y, entity); }
    var typeFlags = typeFlagsToIndex.filter(typeFlag => typeFlag in entity);
    typeFlags.forEach(typeKey => addToIndex(gamestate.byType, typeKey, entity));
  };

  this.removeEntity = function (gamestate, entity) {
	removeFromIndex(gamestate.byX, entity.x, entity);
	removeFromIndex(gamestate.byY, entity.y, entity);
	var typeFlags = typeFlagsToIndex.filter(typeFlag => typeFlag in entity);
    typeFlags.forEach(typeKey => removeFromIndex(gamestate.byType, typeKey, entity));
  };
  
  // see comment for addEntity - shortcut method for updating position
  this.moveEntity = function (gamestate, entity, newX, newY) {
    removeEntity(gamestate, entity);
    entity.x = newX;
    entity.y = newY;
    addEntity(gamestate, entity);
  };

  this.intersectEntitySets = function (A, B) {
    return cartesianProduct(A, B)
    .filter(entityPair => entityPair[0] === entityPair[1])
    .map(entityPair => entityPair[0]);
  };

  this.ready = function () {
    $("#viewport").empty().append($("<span>Loading.. please wait.</span>"));

    Promise.resolve()
    .then(loadResources)
    .then(initEngine)
    .then(startGame)
    .then(draw);
  };

  this.loadResources = function () {
    // put async external resource loading logic here if needed
    return;
  };

  this.initEngine = function () {
    var vp = $("#viewport");
    vp.empty();
    vp.css("height", viewHeight);
    vp.css("width", viewWidth);
    vp.css("background-color", "gray");
    vp.css("color", "white");

    $(window).on("keydown", keyPress);
  };

  this.startGame = function () {
    var gamestate = newGameState();
    this.gamestate = gamestate;
    var player = { player: true, svg: "smiles", x: null, y: null };
    addEntity(gamestate, player);
    moveToLevel(gamestate, testLevel1, "spawn");
    return gamestate;
  };
  
  this.moveToLevel = function (gamestate, levelData, entranceName) {
	var player = one(gamestate.byType, "player");
	
	all(gamestate.byType, "levelBound")
	.forEach(e => removeEntity(gamestate, e));
	
	var level = loadLevel(levelData);
	gamestate.level = level;
	level.tiles.forEach(function (tile, i) {
	  addEntity(gamestate, tile);
    });
    var spawnPoint = level.entrances[entranceName];
    moveEntity(gamestate, player, spawnPoint.x, spawnPoint.y);
  };

  this.keyPress = function (e) {
    var keyCode = e.keyCode;
    if (keyCode == 40) { tryMove([0, 1]); }
    if (keyCode == 38) { tryMove([0, -1]); }
    if (keyCode == 39) { tryMove([1, 0]); }
    if (keyCode == 37) { tryMove([-1, 0]); }
  };

  this.tryMove = function (heading) {
    var gamestate = this.gamestate;
    if (!gamestate) { return; }
    var player = one(gamestate.byType, "player");
    var newX = player.x + heading[0];
    var newY = player.y + heading[1];

    var entitiesAtDestination = intersectEntitySets(
      all(gamestate.byX, newX), all(gamestate.byY, newY));
    
    // walls block even moves to goals, etc., but having a floor
    // is a pre-requisite for a normal move  
    
    var exitTiles = entitiesAtDestination.filter(e => "exit" in e);
    var hasFloor = (entitiesAtDestination.filter(e => "floor" in e).length > 0);
    var hasWall = (entitiesAtDestination.filter(e => "wall" in e).length > 0);
    var hasGoal = (entitiesAtDestination.filter(e => "goal" in e).length > 0);
    var hasExit = (exitTiles.length > 0);
    
    var moveHintText = "";
    var allowMove = hasFloor;
    
    if (hasWall) { moveHintText = "BONK"; allowMove = false; }
    if (hasGoal) { moveHintText = "Found the glowing thing! Winner!"; }
    
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
    
    if (allowMove) { moveEntity(gamestate, player, newX, newY); }
    hintText(moveHintText);
    draw(gamestate);
  };
  
  function svgAmongEntities(svg, entities) {
    return (entities.filter(e => e.svg === svg).length > 0);
  };

  this.draw = function (gamestate) {
    var outStr = "";
    var rowCounter = 0;
    var template = '<div class="renderBox" style="left: Xpx; top: Ypx;"><img src="SVGURL" alt="ALTTEXT" width="100%" height="100%" /></div>';
    
    // TODO instead of a hardcoded render order by svg name, put a z index into tileData.
    var renderOrder = ["floor", "cake", "spawn", "bricks", "stairs", "glowycircle", "smiles"];
    
    range(this.numTilesY).forEach(function (y) {
      range(this.numTilesX).forEach(function (x) {
		var atX = all(gamestate.byX, x);
		var atY = all(gamestate.byY, y);
        var entities = intersectEntitySets(atX, atY);
        var svgsToRender = renderOrder.filter(svg => svgAmongEntities(svg, entities));
        var svg = svgsToRender.slice(-1, svgsToRender.length)[0]; // uppermost only
        var svgName = svg ? svg + ".svg" : "blackbox.svg";
        var html = template
         .replace("SVGURL", svgName)
         .replace("X", x * tilePixelWidth)
         .replace("Y", y * tilePixelWidth)
         .replace("ALTTEXT", entities.map(e => e.sourceStr).join("|")); // debug
        outStr = outStr + html;
      });
      outStr = outStr + "<br>"
    });
    var view = $("<div>" + outStr + "</div>");
    $("#viewport").empty().append(view);
  };
  
  
  // display text to indicate what is going on when visual and other
  // cues have not yet been sufficiently developed.
  // this is intended mostly for use with in-dev features as animations,
  // sounds, etc., are a preferable way to indicate what is happening.
  this.hintText = function (text) {
	$("#hinttext").empty().append("<span>TEXT</span>".replace("TEXT", text));
  };

  // fields allowed in tile data of json level data format - these fields will get
  // copied into loaded level data.  could eventually put validation rules here too..
  this.validTileDataFields = [ "floor", "wall", "goal", "entrance", "exit", "svg" ];
  
  this.loadLevel = function (levelJson) {
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
      " ": { floor: true, svg: "floor",  },
      "0": { svg: "blackbox" },
      "1": { wall: true, svg: "bricks" },
      "2": { entrance: "spawn", floor: true, svg: "floor" },
      "3": { goal: true, floor: true, svg: "glowycircle" },
      "4": { entrance: "stairs1", exit: "testLevel2.stairs1", svg: "stairs" },
      "5": { entrance: "stairs1", exit: "testLevel1.stairs1", svg: "stairs" },
      "6": { entrance: "stairs2", exit: "testLevel2.stairs2", svg: "stairs" },
      "7": { entrance: "stairs2", exit: "testLevel1.stairs2", svg: "stairs" }
    },
    tileData: [
      "011100000000111",
      "11 1100000011 11",
      "12 4100000016 31",
      "11 1100000011 11",
      "011100000000111",
    ].join("\n")
  };
  
  this.testLevel2 = {
    name: "testLevel2",
	tileDataMap: testLevel1.tileDataMap,
	tileData: [
      "0",
      "00111111111111",
      "0015        71",
      "00111111111111",
    ].join("\n")
  };
  
  this.levelJsons = {
    "testLevel1" : testLevel1,
    "testLevel2" : testLevel2
  };

}).apply(this);
