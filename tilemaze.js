import { range, cartesianProduct, hasValue, intersectEntitySets, lerp } from "./misc.js";
import { Vector } from "./vector.js";
import { Timer } from "./timer.js";
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
    this.typeFlagsToIndex = [ "player", "wall", "floor", "exit", "goal", "levelBound", "controller", "timer", "key", "lock", "svgfg3", "svgfg2", "svgfg1", "svgbg1", "svgbg2", "svgbg3" ];
    
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
    if (hasValue(entity.tileCover)) {
      entity.tileCover.map(a => a.components).forEach((xy) => {
        this.addToIndex(gamestate.byX, xy[0], entity);
        this.addToIndex(gamestate.byY, xy[1], entity);
      });
    }
    var typeFlags = this.typeFlagsToIndex.filter(typeFlag => typeFlag in entity);
    typeFlags.forEach(typeKey => this.addToIndex(gamestate.byType, typeKey, entity));
  }

  removeEntity (gamestate, entity) {
    if (hasValue(entity.tileCover)) {
      entity.tileCover.map(a => a.components).forEach((xy) => {
        this.removeFromIndex(gamestate.byX, xy[0], entity);
        this.removeFromIndex(gamestate.byY, xy[1], entity);
      });
    }
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
    let player = {
      player: true, svgfg1: "smiles", x: null, y: null, r: 0.4, tileCover: [],
      runspeed: 3.5, keys: new Set(), recentEntrance: null,
      controller: () => this.playerController(this.gamestate, player)
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
      this.hintText("Unpaused. [P] to pause.. ");
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
      this.hintText("--PAUSED-- [P] to unpause.");
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
    this.all(gamestate.byType, "timer")
     .forEach(e => {
       e.timer.advance(updatePeriod);
    });
    
    this.all(gamestate.byType, "controller")
     .forEach(e => {
      e.intents = new Map();
      e.controller();
      if (e.intents.has("move")) {
        this.tryMove(e, e.intents.get("move"), updatePeriod);
      }
    });
    
    // TODO: update pipeline: collect all controlled entities' intents,
    // then generate pending collisions and interaction events
    // then resolve.  having all logic in tryMove is not going to work
    // for much longer..
  }
  
  playerController (gamestate, entity) {
    let heading = new Vector([0,0]);
    let wantsMove = false;
    if (this.intents.has("moveLeft")) { heading = heading.add(new Vector([-1, 0])); wantsMove = true; }
    if (this.intents.has("moveRight")) { heading = heading.add(new Vector([1, 0])); wantsMove = true; }
    if (this.intents.has("moveUp")) { heading = heading.add(new Vector([0, -1])); wantsMove = true; }
    if (this.intents.has("moveDown")) { heading = heading.add(new Vector([0, 1])); wantsMove = true; }
    if (wantsMove) { entity.intents.set("move", heading); }
  }
  
  aiController (gamestate, entity) {
    // for now just one ai that just randomly bumps around
    const avgTime = 2.0;
    const timer = entity.aibrownianmotiontimer;
    if (timer.complete()) {
      timer.reset(Math.random() * avgTime * 2);
      const v = range(2).map(() => lerp(-1, 1, Math.random()));
      entity.aibrownianheading = (new Vector(v)).unitize();
    }
    entity.intents.set("move", entity.aibrownianheading);
  }
  
  activateSpawner (gamestate, tile) {
    // TODO: should this even be specifically spawners, or should
    // there just be a general "onLevelLoaded" trigger?
    
    let player = this.one(gamestate.byType, "player");
    const spawnerType = tile.spawner;
    
    // TODO: this is too simplistic. really need a event/trigger
    // system for level scripting.. just a bandaid to test whether
    // key and lock work:
    if (spawnerType === "key" && player.keys.has("testkey")) { return; }
    
    // common
    let spawnedEntity = {
      svgfg1: spawnerType, levelBound: true,
      x: tile.x, y: tile.y, r: 0.5,
      tileCover: [ new Vector([tile.x, tile.y]) ]
    };
    
    spawnedEntity[spawnerType] = true; // eg this is a key/lock/slime
    
    // specific handlers - this should probably be refactored to
    // hook into an entity database in a general way
    if (spawnerType === "slime") {
      spawnedEntity.runspeed = 1.8;
      spawnedEntity.controller = () => this.aiController(gamestate, spawnedEntity);
      let moveTimer = new Timer();
      this.addEntity(gamestate, { timer : moveTimer, levelBound: true });
      spawnedEntity.aibrownianmotiontimer = moveTimer;
    }
    
    this.addEntity(gamestate, spawnedEntity);
  }
  
  moveToLevel (gamestate, levelData, entranceName) {
	  let player = this.one(gamestate.byType, "player");
	
	  this.all(gamestate.byType, "levelBound")
     .forEach(e => this.removeEntity(gamestate, e));
	
	  let level = this.loadLevel(levelData);
	  gamestate.level = level;
	  
    level.tiles
     .forEach((tile, i) => this.addEntity(gamestate, tile));
    
    level.tiles
     .filter(tile => "spawner" in tile)
     .forEach(tile => this.activateSpawner(gamestate, tile));
    
    let entranceTile = level.entrances[entranceName];
    let playerXY = new Vector([entranceTile.x, entranceTile.y]);
    player.recentEntrance = entranceName;
    this.moveEntity(gamestate, player, playerXY, [ playerXY ]);
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
    const k = 0.5;
    return [
      tilePosition.add(new Vector([-k, -k])),
      tilePosition.add(new Vector([k, -k])),
      tilePosition.add(new Vector([-k, k])),
      tilePosition.add(new Vector([k, k]))
    ];
  }
  
  doesTileIntersectCircle (tile, center, radius) {
    // strategy: check if same x or same y, in which case will check
    // axis-aligned distance, otherwise check tile corners
    var dims = range(2);
    
    var axisAlignedCheck = dims.map(dim => {
      const halfTile = 0.5;
      if (tile.components[dim] !== center.add(new Vector([halfTile, halfTile])).floor().components[dim]) {
        return false;
      }
      let otherDim = (dim + 1) % 2;
      let tileCenter = tile.components[otherDim];
      return (Math.abs(center.components[otherDim] - tileCenter) <= radius + halfTile);
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
  
  tryMove(entity, heading, updatePeriod) {
    let gamestate = this.gamestate;
    if (!gamestate) { return; }
    
    let player = this.one(gamestate.byType, "player");
    const isPlayer = (entity === player);
    
    let newXY = heading
     .unitize()
     .scale(entity.runspeed * updatePeriod)
     .add(new Vector([entity.x, entity.y]));
    
    let newTileCover = this.intersectCircleVsGrid(newXY, entity.r);
    let entitiesAtDestination = newTileCover
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
      let excluded = gamestate.level.entrances[player.recentEntrance];
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
    if (hasGoal && isPlayer) { moveHintText = "Found the glowing thing! Winner!"; }
    
    // TODO: currently assumes only one key-lock pair "testkey"
    // in existence (proof-of-concept):
    if (hasLock && isPlayer) {
      if (player.keys.has("testkey")) {
        this.removeEntity(gamestate, this.one(gamestate.byType, "lock"));
      }
      else {
        moveHintText = "BONK! Need a key..."; allowMove = false;
      }
    }
    if (hasKey && isPlayer) {
      player.keys.add("testkey");
      this.removeEntity(gamestate, this.one(gamestate.byType, "key"));
      moveHintText = "Got the key.";
    }
    
    if (hasExit && isPlayer) {
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
    
    if (!hasFloor) {
      moveHintText = "No floor there.. scary.";
      allowMove = false;
    }
    
    if (allowMove) {
      this.moveEntity(gamestate, entity, newXY, newTileCover);
      if (isPlayer && hasValue(player.recentEntrance)) {
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
    if (isPlayer) { this.hintText(moveHintText); }
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
    // there is also the camera transform relative to screen space,
    // but this is currently done in viewport.svg
    var camX = -player.x;
    var camY = -player.y;
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
          // for now, display offset (in otherwords, transforming from
          // the topleft of the svg to its center anchor) is not done
          // here but in the individual svgs, but this may change..
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
