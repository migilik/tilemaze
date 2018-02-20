(function () {
  this.tilePixelWidth = 30;
  this.numTilesX = 20;
  this.numTilesY = 15;
  this.viewWidth = this.tilePixelWidth * this.numTilesX;
  this.viewHeight = this.tilePixelWidth * this.numTilesY;
  this.gamestate = null;

  // range(5) => [0, 1, 2, 3, 4]
  this.range = function (x) {
    var result = [];
    for (var i = 0; i < x; i++) { result.push(i); }
    return result;
  };

  this.cartesianProduct = function (A, B) {
    return A.map(a => B.map(b => [a, b]))
    .reduce((x, p) => p.concat(x), []);
  };

  this.newGameState = function () {
    var gs = {
      counter: 0,
      nextID: 0,
      entities: {},
      level: null,
      byX: {},
      byY: {},
      byType: {}
    };
    return gs;
  };

  this.addEntity = function (gamestate, type, x, y) {
    var id = gamestate.nextID;
    gamestate.nextID = id + 1;
    var entity = { id: id, type: type, x: x, y: y };
    gamestate.entities[id] = entity;

    ["byX", "byY", "byType"]
    .forEach(function (mapKey) {
      var shortKey = mapKey.slice(2).toLowerCase(); // eg "x", "y", "type" - ugh, confusing TODO cleanup
      var entityMap = gamestate[mapKey];
      if (!entityMap[entity[shortKey]]) {
        entityMap[entity[shortKey]] = [];
      }
      entityMap[entity[shortKey]].push(entity);
    });
    return id;
  };

  this.removeEntity = function (gamestate, entity) {
    if (entity.id in gamestate.entities) { delete gamestate.entities[entity.id]; }

    ["byX", "byY", "byType"]
    .forEach(function (mapKey) {
      var shortKey = mapKey.slice(2).toLowerCase();
      var list = gamestate[mapKey][entity[shortKey]];
      if (list) {
        var i = list.findIndex(e => e.id === entity.id);
        if (i > -1) { list.splice(i, 1); }
      }
    });
  };

  this.intersectEntitySets = function (A, B) {
    return cartesianProduct(A, B)
    .filter(entityPair => entityPair[0].id === entityPair[1].id)
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
    moveToLevel(gamestate, testLevelData1, testLevelTileDataMap, "spawn");
    
    return gamestate;
  };
  
  this.unloadLevelEntities = function (gamestate) {
    Object.keys(gamestate.entities)
	.filter(function (id) { return (gamestate.entities[id].levelBound === true); })
	.forEach(function (id) {
	  removeEntity(gamestate, gamestate.entities[id]);
	});
  };
  
  this.moveToLevel = function (gamestate, levelData, levelTileDataMap, entranceName) {
	var players = ("player" in gamestate.byType) ? gamestate.byType["player"] : [];
	players.forEach(function (e) {
      removeEntity(gamestate, e);
	});
	
	unloadLevelEntities(gamestate);
	var level = loadLevel(levelData, levelTileDataMap);
	level.forEach(function (tile, i) {
	  var entityId = addEntity(gamestate, tile.type, tile.x, tile.y);
	  var tileEntity = gamestate.entities[entityId];
	  tileEntity.levelBound = true;
	  tileEntity.sourceTile = tile;
    });
    var spawnPoint = gamestate
    .byType["stairs"]
    .filter(function (e) { return (e.sourceTile.linkName === entranceName); })[0];
    addEntity(gamestate, "player", spawnPoint.x, spawnPoint.y);
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
    if (gamestate.byType.player.length !== 1) { return; }
    var player = gamestate.byType.player[0];
    var newX = player.x + heading[0];
    var newY = player.y + heading[1];

    var entitiesAtDestination = intersectEntitySets(
      gamestate.byX[newX], gamestate.byY[newY]);

    var stairs = entitiesAtDestination
    .filter(e => e.type === "stairs")
    .filter(e => e.sourceTile.destination);
    
    if (entitiesAtDestination.filter(e => e.type === "exit").length > 0) {
      alert("Found the glowing thing! Winner");
    }
    else if (stairs.length > 0) {
	  var stairEntity = stairs[0];
	  var levelDataMap = { // TODO cleanup
		"testLevelData1" : testLevelData1,
		"testLevelData2" : testLevelData2,
	  };
	  var sourceTile = stairEntity.sourceTile;
	  var levelData = levelDataMap[sourceTile.destination];
	  moveToLevel(gamestate, levelData, testLevelTileDataMap, sourceTile.linkName);
	  draw(gamestate);
	  return;
	}
    else if (entitiesAtDestination.filter(e => e.type === "wall").length > 0) {
      return;
    }

    removeEntity(gamestate, player);
    addEntity(gamestate, "player", newX, newY);

    draw(gamestate);
  };

  this.draw = function (gamestate) {
    var outStr = "";
    var rowCounter = 0;
    var template = '<div class="renderBox" style="left: Xpx; top: Ypx;"><img src="SVGURL" width="100%" height="100%" /></div>';
    var svgMap = { // to do, allow per-level and per-block overrides for style
     floor: "floor",
     spawn: "floor",
     wall: "bricks",
     exit: "glowycircle",
     player: "smiles",
     stairs: "stairs",
    };
    var renderOrder = ["floor", "spawn", "wall", "stairs", "exit", "player"];
    range(this.numTilesY).forEach(function (y) {
      range(this.numTilesX).forEach(function (x) {
        if (!gamestate.byX[x] || !gamestate.byY[y]) { return; }
        var html = "";
        var entities = intersectEntitySets(gamestate.byX[x], gamestate.byY[y]);
        var entityHtml = "";
        renderOrder.forEach(function (tileType) {
		  if (entities.findIndex(e => e.type === tileType) == -1) { return; }
		  html = template.replace("SVGURL", svgMap[tileType] + ".svg");
		});
        html = html.replace("X", x * tilePixelWidth).replace("Y", y * tilePixelWidth);
        outStr = outStr + html;
      });
      outStr = outStr + "<br>"
    });
    var view = $("<div>" + outStr + "</div>");
    $("#viewport").empty().append(view);
  };

  this.loadLevel = function (levelData, tileDataMap) {
	var level = [];
    levelData.split('\n').forEach(function (rowStr, rowNum) {
      rowStr.split('').forEach(function (char, colNum) {
        var tileData = tileDataMap[char].split(" ");
        var levelTile = {
		  type: tileData[0],
		  x: colNum,
		  y: rowNum
		};
        if (levelTile.type === "stairs") {
		  levelTile.linkName = tileData[1];
		  levelTile.destination = tileData[2];
		}
		level.push(levelTile);
      });
    });
    return level;
  };
  
  this.testLevelTileDataMap = {
    " ": "floor",
    "1": "wall",
    "2": "stairs spawn",
    "3": "exit",
    "4": "stairs testLink testLevelData2",
    "5": "stairs testLink testLevelData1"
  };
  
  this.testLevelData1 = [
    "1111111111111111111",
    "1 1    1   1      1",
    "1  4 1   1 1 1111 1",
    "1 111111 1   1 1  1",
    "1       11 11  1 11",
    "111111 1      1   1",
    "1    1 1 11111 1111",
    "1  1 1  213       1",
    "11 1   1 11111 11 1",
    "1  111 1 1 1  1   1",
    "1 1      1 1   1 11",
    "1 1 11111  1 11   1",
    "1 11   1 1   1111 1",
    "1    1     1      1",
    "1111111111111111111",
  ].join("\n");
  
    this.testLevelData2 = [
    "1111111111",
    "1        1",
    "1  5 1   1",
    "1   1    1",
    "1  1     1",
    "1111111111",
  ].join("\n");

}).apply(this);
