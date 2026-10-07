// Every measurement of the watch box lives here. Units are metres (glTF native).
// Overall dimensions are UNVERIFIED estimates (33 x 10 x 9 cm) – replace them
// with the supplier's numbers and re-run `npm run model:all`; every part below
// is derived from these values, so the whole model rescales consistently.
//
// Axes: X = length (left -> right), Y = up, Z = width (+Z is the FRONT, where
// the latch is; -Z is the BACK, where the hinges are). Origin = bottom centre.

export const CONFIG = {
  dimensions: {
    length: 0.33,
    width: 0.10,
    baseHeight: 0.065,
    lidHeight: 0.025,
  },

  frame: {
    post: 0.0085, // corner extrusion size (square, rounded outer edge)
    postRadius: 0.0032,
    railDepth: 0.0045, // how far an edge rail reaches in from the outer surface
    railRadius: 0.0012,
    bottomRail: 0.005, // visible height of the bottom rail on each face
    baseSeamRail: 0.0065, // base rail at the lid/base seam
    lidSeamRail: 0.0048, // lid rail at the seam
    panelInset: 0.0011, // green panels sit this far behind the black frame face
    wall: 0.0075, // total wall thickness (frame + lining) at the rim
  },

  ribs: {
    pitch: 0.0031, // distance between horizontal ribs on the green panels
  },

  lid: {
    bullnoseWidth: 0.0085, // rolled black frame around the glass (plan width)
    bullnoseHeight: 0.0075,
    bullnoseCornerRadius: 0.0065,
    glassThickness: 0.0025,
    velvetBorder: 0.0065, // velvet band around the glass on the underside
    velvetBorderThickness: 0.003,
    openAngleDeg: 100,
    openDuration: 1.5,
  },

  interior: {
    slots: 6,
    floorHeight: 0.009, // top of the velvet floor above the outside bottom
    dividerThickness: 0.0042,
    dividerTopBelowRim: 0.015,
    pillowTopBelowRim: -0.003, // negative = crown rises above the rim (image 1)
    pillowGapToWall: 0.0015,
    pillowRadius: 0.0145,
    pillowDome: 0.006, // extra crown height in the middle of each pillow
    lipWidth: 0.0062, // velvet lining wrapped over the top rim of the base
    lipHeight: 0.0018,
  },

  hinge: {
    centerFromEnd: 0.043,
    width: 0.023,
    baseLeafHeight: 0.0105,
    lidLeafHeight: 0.0085,
    thickness: 0.0016,
    knuckleRadius: 0.0021,
    screwRadius: 0.0015,
  },

  latch: {
    plateWidth: 0.017,
    plateHeight: 0.02,
    leverWidth: 0.0115,
    leverLength: 0.017,
    loopInnerWidth: 0.012,
    wireRadius: 0.0007,
    catchWidth: 0.014,
    catchHeight: 0.0045,
  },

  rivet: {
    radius: 0.0013,
    fromCorner: 0.0125, // distance of corner rivets from the end of a face
  },

  colors: {
    aluminumGreen: '#3a6a5e',
    black: '#151617',
    velvet: '#23574a',
    velvetSheen: '#5f9e8a',
  },
};
