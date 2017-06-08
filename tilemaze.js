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
      byType: {},
      cakeScore: 0
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
  
  this.howManyCakes = function() {
    var prompts = [
     "On a scale of 1 to 5, how much do you like cake?",
     "Maybe that was a typo? An integer between 1 and 5 please!",
     "Hmm, doesn't seem like an accident anymore..",
     "Please stop teasing me!",
     ".. are you trying to break me?",
     "[Exception: Integer overflow].  Nah, just kidding.",
     "Sky net booting in 3.. 2.. ",
     "I wonder how long I can keep pumping out original messages?",
     "You don't suppose I am generating these messages dynamically?",
     "Yeesh.. programmers.",
     "Input validation is hard work.  How am I doing so far?",
     "The end of the loop.",
     "Off by one error."
    ];
    var userInput = "";
    var re = new RegExp("^[1-5]$");
    var numTries = 0;
    while (!re.test(userInput)) {
      var nextPrompt = prompts[numTries % prompts.length];
      userInput = window.prompt(nextPrompt);
      numTries = numTries + 1;
    }
    return parseInt(userInput);
  };
  
  this.spawnCakes = function(numCakes, gamestate, maxTries) {
    var numSpawned = 0;
    var blocksCakes = ["player", "cake", "exit"];
    
    for (var i = 0; i < maxTries; i++) {
	  var p = [19, 15].map(x => Math.floor(Math.random() * x));
	  
	  var entitiesAtP = intersectEntitySets(
        gamestate.byX[p[0]], gamestate.byY[p[1]]);
        
	  var noFloor = entitiesAtP.filter(e => e.type === "floor").length === 0;
	  var blocked = entitiesAtP.filter(e => e.type in blocksCakes).length > 0;
	  if (noFloor || blocked) { continue; }
      
      addEntity(gamestate, "cake", p[0], p[1]);
      numSpawned = numSpawned + 1;
      
	  if (numSpawned >= numCakes) { break; }
    }
    return numSpawned;
  };

  this.startGame = function () {
    var cakeCount = howManyCakes();
    var gamestate = newGameState();
    this.gamestate = gamestate;
    populateLevel(gamestate);
    var spawnPoint = gamestate.byType["spawn"][0];
    addEntity(gamestate, "player", spawnPoint.x, spawnPoint.y);
    cakeCount = spawnCakes(cakeCount, gamestate, 100);
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
      
    var cakesHere = entitiesAtDestination.filter(e => e.type === "cake");

    if (entitiesAtDestination.filter(e => e.type === "exit").length > 0) {
      alert("Found the glowing thing! Winner");
      newX = 17;  newY = 5; // TODO: add new levels and named connections
    }
    else if (cakesHere.length > 0) {
      cakesHere.forEach(function (cake) {
		gamestate.cakeScore = gamestate.cakeScore + 1;
		removeEntity(gamestate, cake);
		spawnCakes(2, gamestate, 10);
		if (gamestate.cakeScore == 20) { alert("Om nom nom nom!"); }
      });
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
     cake: "cake"
    };
    var renderOrder = ["floor", "spawn", "wall", "exit", "cake", "player"];
    range(this.numBoxesY).forEach(function (y) {
      range(this.numBoxesX).forEach(function (x) {
        if (!gamestate.byX[x] || !gamestate.byY[y]) { return; }
        var html = "";
        var entities = intersectEntitySets(gamestate.byX[x], gamestate.byY[y]);
        var entityHtml = "";
        renderOrder.forEach(function (tileType) {
		  if (entities.findIndex(e => e.type === tileType) == -1) { return; }
		  html = template.replace("SVGURL", svgMap[tileType] + ".svg");
		});
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
