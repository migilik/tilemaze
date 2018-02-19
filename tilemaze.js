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
      var shortKey = mapKey.slice(2).toLowerCase();
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
    populateLevel(gamestate, testLevelData, testLevelTypeMap);
    var spawnPoint = gamestate.byType["spawn"][0];
    addEntity(gamestate, "player", spawnPoint.x, spawnPoint.y);
    return gamestate;
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

    if (entitiesAtDestination.filter(e => e.type === "exit").length > 0) {
      alert("Found the glowing thing! Winner");
      newX = 17;  newY = 5; // TODO: add new levels and named connections
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
     player: "smiles"
    };
    var renderOrder = ["floor", "spawn", "wall", "exit", "player"];
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

  this.testLevelData = [
    "1111111111111111111",
    "1 1    1   1      1",
    "1    1   1 1 1111 1",
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

  this.testLevelTypeMap = {
    " ": "floor",
    "1": "wall",
    "2": "spawn",
    "3": "exit"
  };

  this.populateLevel = function (gamestate, levelData, typeMap) {
    levelData.split('\n').forEach(function (rowStr, rowNum) {
      rowStr.split('').forEach(function (char, colNum) {
        var entityType = typeMap[char];
        addEntity(gamestate, entityType, colNum, rowNum);
      });
    });
  };



}).apply(this);
