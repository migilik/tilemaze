// use format that can easily be imported from a JSON file
// so that later (TODO) can move 
const testLevel1 = {
  name: "testLevel1",
  tileDataMap: {
    ".": { floor: true, svgbg2: "floor",  },
    " ": { wall: true },
    "1": { wall: true, svgbg1: "bricks" },
    "2": { entrance: "spawn", floor: true, svgbg2: "floor" },
    "3": { goal: true, floor: true, svgbg1: "glowycircle", svgbg2: "floor" },
    "4": { floor: true, entrance: "stairs1", exit: "testLevel2.stairs1", svgbg1: "stairs", svgbg2: "floor" },
    "5": { floor: true, entrance: "stairs1", exit: "testLevel1.stairs1", svgbg1: "stairs", svgbg2: "floor" },
    "6": { floor: true, entrance: "stairs2", exit: "testLevel2.stairs2", svgbg1: "stairs", svgbg2: "floor" },
    "7": { floor: true, entrance: "stairs2", exit: "testLevel1.stairs2", svgbg1: "stairs", svgbg2: "floor" },
    "8": { floor: true, spawner: "key", svgbg2: "floor" },
    "9": { floor: true, spawner: "lock", svgbg2: "floor" },
    "a": { floor: true, entrance: "stairs3", exit: "testLevel2.stairs3", svgbg1: "stairs", svgbg2: "floor" },
    "b": { floor: true, entrance: "stairs3", exit: "testLevel1.stairs3", svgbg1: "stairs", svgbg2: "floor" },
    "S": { floor: true, spawner: "slime", svgbg2: "floor" },
  },
  tileData: [
    " 111        111 ",
    "11.11      11.11",
    "12.41      16.31",
    "11.11      11.11",
    " 11111111111111 ",
    " 1.S.a........1 ",
    " 1........8...1 ",
    " 1............1 ",
    " 11111111111111 "
  ].join("\n")
};

const testLevel2 = {
  name: "testLevel2",
  tileDataMap: testLevel1.tileDataMap,
  tileData: [
    " ",
    "  111111111111",
    "  15..S.9...71",
    "  111.11111111",
    "    1.1",
    "    1b1",
    "    111"
  ].join("\n")
};

export { testLevel1, testLevel2 };
