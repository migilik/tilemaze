import { range, cartesianProduct, hasValue, intersectEntitySets } from "./misc.js";
import { Vector } from "./vector.js";
import { testLevel1, testLevel2 } from "./testlevel.js";

// TODO: architecture + break-up

const drawLayers = ["bg3", "bg2", "bg1", "fg1", "fg2", "fg3"];

class GameState {
  constructor () {
    this.counter = 0;
    this.level = null;
    this.byX = new Map();
    this.byY = new Map();
    this.byType = new Map();
  }
}

class TileMaze {
  // client html should do:
  //  $(ready);
  //  $(window).on("load", onWindowLoaded);
  // Former hook starts app init on DOM-ready, and
  // later is to resolve a promise that is used to block
  // eg first redraw until the viewport svg is actually loaded.
  constructor () {
    this.windowLoaded = $.Deferred();
    
    this.tilePixelWidth = 30;
    this.gamestate = null;
    this.svgNS = "http://www.w3.org/2000/svg";
    
    // arbitrary camera transform setting the "center" of the screen
    // relative to top left, in number of tiles.. this needs to be
    // done a better way.
    this.cameraFocusX = 11;
    this.cameraFocusY = 6;
    
    // see updateLoop:
    this.lastTimestampMS = null; // if null, then paused should be true
    this.updateBacklogTimeMS = 0;
    this.maxUpdatesWithoutDraw = 10; // if backlog gets this deep, warn..
    this.gameUpdateRateFPS = 20; // separate from redraw FPS
    this.gameUpdatePeriodS = (1.0 / this.gameUpdateRateFPS);
    this.pauseQueued = false;
    this.paused = true; // lock requestAnimationFrame
    
    // precursor to implementing an actual controller
    this.intents = new Set();
    
    // max svg redraw suspension time (in practice draw() should not be
    // taking this long to complete and release the suspension cleanly).
    this.maxSvgSuspendTimeMS = 1000;
    
    // the keys subject to indexing in gamestate.byType (these are property names of entities)
    this.typeFlagsToIndex = [ "player", "wall", "floor", "exit", "goal", "levelBound", "key", "lock", "svgfg3", "svgfg2", "svgfg1", "svgbg1", "svgbg2", "svgbg3" ];
    
    // fields allowed in tile data of json level data format - these fields will get
    // copied into loaded level data.  could eventually put validation rules here too..
    this.validTileDataFields = [ "floor", "wall", "goal", "entrance", "exit", "spawner", "svgfg3", "svgfg2", "svgfg1", "svgbg1", "svgbg2", "svgbg3" ];
    
    this.levelJsons = {
      "testLevel1" : testLevel1,
      "testLevel2" : testLevel2
    };
  }
  
  bindReadyHandlers () {
    $(e => this.ready());
    $(window).on("load", e => this.windowLoaded.resolve());
  }
  
  // used by addEntity: build lookup indices for game entities by relevant keys
  addToIndex (index, key, entity) {
    if (!hasValue(key)) { throw "invalid key: " + toString(key); }
    if (!index.has(key)) { index.set(key, new Set()); }
    index.get(key).add(entity);
  }
  
  // opposite of addToIndex
  removeFromIndex (index, key, entity) {
    if (!index.has(key)) { return; }
    if (!index.get(key).has(entity)) { return; }
    index.get(key).delete(entity);
  }
  
  // all elements of index at key
  all (index, key) {
    if (index.has(key)) { return Array.from(index.get(key).keys()); }
    return [];
  }
  
  // exactly one element of index at key, or exception
  one (index, key) {
    var elements = this.all(index, key);
    if (elements.length !== 1) { throw "key " + key + " does not store exactly one value (actual: " + elements.length + ")"; }
    return elements[0];
  }
  
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
  addEntity (gamestate, entity) {
    entity.tileCover.map(a => a.components).forEach((xy) => {
      if (hasValue(xy[0])) { this.addToIndex(gamestate.byX, xy[0], entity); }
      if (hasValue(xy[1])) { this.addToIndex(gamestate.byY, xy[1], entity); }
    });
    var typeFlags = this.typeFlagsToIndex.filter(typeFlag => typeFlag in entity);
    typeFlags.forEach(typeKey => this.addToIndex(gamestate.byType, typeKey, entity));
  }

  removeEntity (gamestate, entity) {
    entity.tileCover.map(a => a.components).forEach((xy) => {
      this.removeFromIndex(gamestate.byX, xy[0], entity);
      this.removeFromIndex(gamestate.byY, xy[1], entity);
    });
    var typeFlags = this.typeFlagsToIndex.filter(typeFlag => typeFlag in entity);
    typeFlags.forEach(typeKey => this.removeFromIndex(gamestate.byType, typeKey, entity));
  }
  
  // see comment for addEntity - shortcut method for updating position
  moveEntity (gamestate, entity, newXY, newTileCover) {
    this.removeEntity(gamestate, entity);
    entity.x = newXY.components[0];
    entity.y = newXY.components[1];
    entity.tileCover = newTileCover;
    this.addEntity(gamestate, entity);
  }

  ready () {
    this.hintText("Loading.. please wait...");
	
    Promise.resolve()
    .then(() => this.loadResources())
    .then(() => this.waitForView())
    .then(() => this.bindControls())
    .then(() => this.startGame())
    .then(() => this.resume());
  }

  loadResources () {
    // put async external resource loading logic here if needed
    return;
  }

  bindControls () {
    // seems we need both of these for keyboard handling to work through
    // the view svg, but the behavior appears a little odd..
    // TODO investigate further
    $(window).on("keydown", e => this.keyDown(e));
    //$("#view").on("keydown", keyPress);
    
    $(window).on("keyup", e => this.keyUp(e));
    $(window).on("focusout", e => this.focusOut(e));
  }
  
  waitForView () {
    return this.windowLoaded; // can not guarantee svg access until svg loads
  }

  startGame () {
    this.gamestate = new GameState();
    var player = {
      player: true, svgfg1: "smiles", x: null, y: null, r: 0.4, tileCover: [],
      runspeed: 3.5, keys: new Set(), recentEntrance: null
    };
    this.addEntity(this.gamestate, player);
    this.moveToLevel(this.gamestate, testLevel1, "spawn");
  }
  
  // top-level pause (user initiated, from console for debug, etc)
  // delayed effect: actual pause occurs on next updateLoop
  pause () {
    this.pauseQueued = true;
  }
  
  // top-level resume (user initiated, from console for debug, etc)
  resume () {
    this.pauseQueued = false;
    if (this.paused) {
      this.hintText("Unpausing.. ");
      this.paused = false;
      window.requestAnimationFrame(t => this.updateLoop(t));
    }
  }
  
  togglePause () {
    if (this.paused) { this.resume(); }
    else { this.pause(); }
  }
  
  updateLoop (timestampMS) {
    var pauseQueued = this.pauseQueued;
    if (!pauseQueued) {
      window.requestAnimationFrame(t => this.updateLoop(t));
    }
    else {
      this.paused = true;
      this.hintText("--PAUSED--");
    }
    
    var lastTimestamp = this.lastTimestampMS;
    if (hasValue(lastTimestamp)) {
      var timeElapsedMS = timestampMS - lastTimestamp;
      this.updateBacklogTimeMS = this.updateBacklogTimeMS + timeElapsedMS;
    }
    this.lastTimestampMS = pauseQueued ? null : timestampMS;
    
    var numUpdates = Math.floor(this.updateBacklogTimeMS * this.gameUpdateRateFPS * 0.001);
    var reduceBacklog = (1000 * numUpdates * this.gameUpdatePeriodS);
    this.updateBacklogTimeMS = this.updateBacklogTimeMS - reduceBacklog;
    if (numUpdates > this.maxUpdatesWithoutDraw) {
      var numDropped = numUpdates - this.maxUpdatesWithoutDraw;
      numUpdates = this.maxUpdatesWithoutDraw;
      console.log("Performance warning: exceeded update backlog, dropping update frames -> slow down will result.  Dropped: " + numDropped + " frames.");
    }
    
    for (var i = 0; i < numUpdates; i++) {
      this.updateGameState(this.gamestate, this.gameUpdatePeriodS);
    }
  
    // TODO: could throttle to separate redraw FPS here, so that do not
    // redraw too often - but browsers already throttle to 60 FPS anyway?
    // ... and 60 FPS is a pipe dream on most rigs right now, even if we
    // get around to optimization.
    // Current ideal would be 20 game FPS and 60 redraw FPS?
    this.draw(this.gamestate, new Set(["fg1", "fg2", "fg3"]));
  }
  
  updateGameState (gamestate, updatePeriod) {
    var heading = new Vector([0,0]);
    var wantsMove = false;
    if (this.intents.has("moveLeft")) { heading = heading.add(new Vector([-1, 0])); wantsMove = true; }
    if (this.intents.has("moveRight")) { heading = heading.add(new Vector([1, 0])); wantsMove = true; }
    if (this.intents.has("moveUp")) { heading = heading.add(new Vector([0, -1])); wantsMove = true; }
    if (this.intents.has("moveDown")) { heading = heading.add(new Vector([0, 1])); wantsMove = true; }
    if (wantsMove) {
      this.tryMove(heading, updatePeriod);
    }
  }
  
  moveToLevel (gamestate, levelData, entranceName) {
	  var player = this.one(gamestate.byType, "player");
	
	  this.all(gamestate.byType, "levelBound")
     .forEach(e => this.removeEntity(gamestate, e));
	
	  var level = this.loadLevel(levelData);
	  gamestate.level = level;
	  level.tiles.forEach((tile, i) => {
	    this.addEntity(gamestate, tile);
	    if ("spawner" in tile) {
		    var doSpawn = true;
        var spawnerType = tile.spawner;
        // TODO: this is too simplistic. really need a event/trigger
        // system for level scripting.. just a bandaid to test whether
	      // key and lock work
	      if (spawnerType === "key" && player.keys.has("testkey")) { doSpawn = false; }
	      var spawnedEntity = {
          svgfg1: spawnerType, levelBound: true,
          x: tile.x + 0.5, y: tile.y + 0.5, r: 0.5,
          tileCover: [ new Vector([tile.x, tile.y]) ]
        };
		    if (doSpawn) {
	        spawnedEntity[spawnerType] = true;
	        this.addEntity(gamestate, spawnedEntity);
	      }
      }
    });
    var spawnEntity = level.entrances[entranceName];
    var spawnPoint = new Vector([spawnEntity.x, spawnEntity.y]);
    player.recentEntrance = entranceName;
    this.moveEntity(gamestate, player, spawnPoint.add(new Vector([0.5, 0.5])), [ spawnPoint ]);
    this.draw(gamestate, new Set(["bg1", "bg2", "bg3"]));
  }

  keyDown (e) {
    const code = e.key;
    if (code === "ArrowDown") { this.intents.add("moveDown"); }
    if (code === "ArrowUp") { this.intents.add("moveUp"); }
    if (code === "ArrowRight") { this.intents.add("moveRight"); }
    if (code === "ArrowLeft") { this.intents.add("moveLeft"); }
    if (code === "p") { this.togglePause(); }
  }
  
  keyUp (e) {
    const code = e.key;
    if (code === "ArrowDown") { this.intents.delete("moveDown"); }
    if (code === "ArrowUp") { this.intents.delete("moveUp"); }
    if (code === "ArrowRight") { this.intents.delete("moveRight"); }
    if (code === "ArrowLeft") { this.intents.delete("moveLeft"); }
  }
  
  focusOut (e) {
    // if lose focus, treat as if keyup for all keys, since will miss
    // actual keyup event
    this.intents.delete("moveDown");
    this.intents.delete("moveUp");
    this.intents.delete("moveRight");
    this.intents.delete("moveLeft");
  }
  
  tileCorners (tilePosition) {
    return [
      tilePosition,
      tilePosition.add(new Vector([0, 1])),
      tilePosition.add(new Vector([1, 0])),
      tilePosition.add(new Vector([1, 1]))
    ];
  }
  
  doesTileIntersectCircle (tile, center, radius) {
    // strategy: check if same x or same y, in which case will check
    // axis-aligned distance, otherwise check tile corners
    var dims = range(2);
    
    var axisAlignedCheck = dims.map(dim => {
      if (tile.components[dim] !== center.floor().components[dim]) {
        return false;
      }
      var otherDim = (dim + 1) % 2;
      var tileCenter = tile.components[otherDim] + 0.5;
      return (Math.abs(center.components[otherDim] - tileCenter) <= 0.5);
    });
    
    if (axisAlignedCheck.reduce((a, b) => a || b, false) === true) {
      return true;
    }
    
    var distancesSq = this.tileCorners(tile)
      .map(corner => corner.add(center.scale(-1)).magnitudeSquared());
    var radiusSquared = radius * radius;
    var inRange = distancesSq.map(d2 => d2 <= radiusSquared);
    return inRange.reduce((a, b) => a && b, true);
  }
  
  intersectCircleVsGrid(center, radius) {
    // not the most efficient way to do this, but currently
    // assuming radius will usually be on order of [0,10].. that is
    // subtile, tile, or handful of tiles.
    var intRadius = Math.ceil(radius);
    var scanHalfDiagonal = new Vector ([intRadius, intRadius]);
    var centerTile = center.floor();
    var scanTopLeft = centerTile.add(scanHalfDiagonal.scale(-1));
    var scanBottomRight = centerTile.add(scanHalfDiagonal);
    var scanDiagonal = scanHalfDiagonal.scale(2);
    var scanRanges = scanDiagonal.components.map(x => range(x + 1));
    
    var tiles = cartesianProduct(scanRanges[0], scanRanges[1])
    .map(xy => scanTopLeft.add(new Vector(xy)))
    .filter(v => this.doesTileIntersectCircle(v, center, radius));
    return tiles; 
  }
  
  tryMove(heading, updatePeriod) {
    var gamestate = this.gamestate;
    if (!gamestate) { return; }
    var player = this.one(gamestate.byType, "player");
    
    var newXY = heading
     .unitize()
     .scale(player.runspeed * updatePeriod)
     .add(new Vector([player.x, player.y]));
    
    var newTileCover = this.intersectCircleVsGrid(newXY, player.r);
    var entitiesAtDestination = newTileCover
    .map(a => a.components)
    .map((xy) => {
      var atX = this.all(gamestate.byX, xy[0]);
      var atY = this.all(gamestate.byY, xy[1]);
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
        this.removeEntity(gamestate, this.one(gamestate.byType, "lock"));
      }
      else {
        moveHintText = "BONK! Need a key..."; allowMove = false;
      }
    }
    if (hasKey) {
      player.keys.add("testkey");
      this.removeEntity(gamestate, this.one(gamestate.byType, "key"));
      moveHintText = "Got the key.";
    }
    
    if (hasExit) {
      var exit = exitTiles[0].exit;
      var levelName = gamestate.level.name;
      if (exit.split(".").length == 2) { // cross-level exits use "level.exit" notation
        levelName = exit.split(".")[0];
        exit = exit.split(".")[1];
      }
      
      var levelJson = this.levelJsons[levelName];
      this.moveToLevel(gamestate, levelJson, exit);
      return;
    }
    
    if (!hasFloor) { this.hintText("No floor there.. scary."); allowMove = false; }
    
    if (allowMove) {
      this.moveEntity(gamestate, player, newXY, newTileCover);
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
    this.hintText(moveHintText);
  }
  
  svgDoc () {
    return $("#view")[0].contentDocument;
  }
  
  makeSvgNode (href, x, y) {
    var svgUse = this.svgDoc().createElementNS(this.svgNS, "use");
    svgUse.setAttribute("href", href);
    var xformStr = "translate(X,Y)".replace("X", x).replace("Y", y);
    svgUse.setAttribute("transform", xformStr);
    return svgUse;
  }
  
  updateCameraPosition (gamestate, svgCamera) {
    var player = this.one(gamestate.byType, "player");
    var camX = this.cameraFocusX - player.x;
    var camY = this.cameraFocusY - player.y;
    var newTransformStr = "translate(X, Y)".replace("X", camX).replace("Y", camY);
    svgCamera.attr("transform", newTransformStr);
  }

  draw (gamestate, layers) {
    // need to pass contentDocument as context to JQuery for
    // svg element manipulation to work right when using external svg:
    let view = $("#view");
    let svgDoc = this.svgDoc();
    
    // wrap svg modifications in a suspend call to improve framerate
    // by reducing total amount of redrawing
    let suspendDrawHandle = svgDoc.documentElement.suspendRedraw(this.maxSvgSuspendTimeMS);
    try {
      let svgCamera = $("#cameraoffset", svgDoc);
      this.updateCameraPosition(gamestate, svgCamera);
    
      drawLayers.forEach(layerName => {
        if (!layers.has(layerName)) { return; }
        let svgKey = "svg" + layerName;
        let layer = $("#" + layerName, svgDoc);
        layer.empty();
        let renderables = this.all(gamestate.byType, svgKey);
        
        renderables.forEach(e => {
          let renderWorldX = e.x;
          let renderWorldY = e.y;
          if (hasValue(e.r)) {
            // single-tile svgs already have equal game x/y and display x/y,
            // both at top-left corner, but everything else needs to be
            // offset to the appropriate display position
            // (ie anchor to top-left corner of svg instead of in-game center)
            // For now, hacky, but just offset via radius if exists.. later
            // will need a more general mechanism
            renderWorldX = renderWorldX - e.r;
            renderWorldY = renderWorldY - e.r;
          }
          let svgNode = this.makeSvgNode("viewport.svg#" + e[svgKey], renderWorldX, renderWorldY);
          layer.append($(svgNode));
        });
      });
    }
    finally {
      svgDoc.documentElement.unsuspendRedraw(suspendDrawHandle);
    }
  }
  
  
  // display text to indicate what is going on when visual and other
  // cues have not yet been sufficiently developed.
  // this is intended mostly for use with in-dev features as animations,
  // sounds, etc., are a preferable way to indicate what is happening.
  hintText (text) {
    $("#hinttext").empty().append("<span>TEXT</span>".replace("TEXT", text));
  }
  
  loadLevel (levelJson) {
    this.hintText("Now entering " + levelJson.name + " ... ");
	  // from json data format to in-memory format with tile mappings already applied
	  var level = {
	    name: levelJson.name,
	    tiles: [],
	    entrances: {}
	  };
    levelJson.tileData.split('\n').forEach((rowStr, rowNum) => {
      rowStr.split('').forEach((char, colNum) => {
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
        
		    this.validTileDataFields
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
  }
}

var game = new TileMaze();
game.bindReadyHandlers();
export { game };
