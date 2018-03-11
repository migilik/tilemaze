// use format that can easily be imported from a JSON file
// so that later (TODO) can move 
let testLevel1 = {
  name: "testLevel1",
  tileDataMap: {
    ".": { floor: true, svg: "floor",  },
    " ": { wall: true },
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

let testLevel2 = {
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

export { testLevel1, testLevel2 };
