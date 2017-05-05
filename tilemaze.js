(function () {
  this.boxWidth = 30;
  this.numBoxesX = 20;
  this.numBoxesY = 15;
  this.viewWidth = this.boxWidth * this.numBoxesX;
  this.viewHeight = this.boxWidth * this.numBoxesY;
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
    populateLevel(gamestate);
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
      alert("Found the cake! Winner");
      return;
    }
    if (entitiesAtDestination.filter(e => e.type === "wall").length > 0) {
      return;
    }

    removeEntity(gamestate, player);
    addEntity(gamestate, "player", newX, newY);

    draw(gamestate);
  };

  this.draw = function (gamestate) {
    var outStr = "";
    var rowCounter = 0;
    var template = '<div class="renderBox" style="left: Xpx; top: Ypx; color:COLOR">CHAR</div>';
    range(this.numBoxesY).forEach(function (y) {
      range(this.numBoxesX).forEach(function (x) {
        if (!gamestate.byX[x] || !gamestate.byY[y]) { return; }
        var html = "";
        var entities = intersectEntitySets(gamestate.byX[x], gamestate.byY[y]);
        var entityHtml = "";
        if (entities.findIndex(e => e.type === "floor") > -1) {
          html = template.replace("CHAR", "\u25A1").replace("COLOR", "white");
        }
        if (entities.findIndex(e => e.type === "spawn") > -1) {
          html = template.replace("CHAR", "\u25A1").replace("COLOR", "white");
        }
        if (entities.findIndex(e => e.type === "wall") > -1) {
          html = template.replace("CHAR", "\u25A0").replace("COLOR", "red");
        }
        if (entities.findIndex(e => e.type === "exit") > -1) {
          html = template.replace("CHAR", "\uD83C\uDF82").replace("COLOR", "pink");
        }
        if (entities.findIndex(e => e.type === "player") > -1) {
          html = template.replace("CHAR", "\uD83D\uDE0A").replace("COLOR", "yellow");
        }
        html = html.replace("X", x * boxWidth).replace("Y", y * boxWidth);

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

  this.populateLevel = function (gamestate, levelDataStr) {
    // for now ignore levelData and populate with hardcoded:
    var levelData = testLevelData;
    var typeMap = testLevelTypeMap;

    levelData.split('\n').forEach(function (rowStr, rowNum) {
      rowStr.split('').forEach(function (char, colNum) {
        var entityType = typeMap[char];
        addEntity(gamestate, entityType, colNum, rowNum);
      });
    });
  };



}).apply(this);
