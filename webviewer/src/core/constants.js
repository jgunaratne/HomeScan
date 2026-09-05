// Body band stops below the lowest door header: RoomPlan reports headers as low
// as 1.63 m here, and blocking any higher walls off real doorways. Window sills
// sit at 0.82 m and up, so they still stop you.
// EYE is set by eye, not by anatomy. A 5'10" viewer's real eye height is about
// 1.66 m, but the 62 degree lens still spreads the floor wider than life, and at
// anything near 1.62 m you read as looking down on the rooms and the house comes
// out small. 1.30 m overshot the other way. 1.38 m is what looked level — and it
// is only a starting point now: the walking bar carries a slider, because which
// height reads as standing depends on the screen you are standing in front of.
// SPEED is a slow indoor walk, not the 3.1 m/s jog it started as: at a jog the
// rooms go by faster than the eye can size them, which reads as a small house.
export const WALL_T = 0.11, EYE = 1.38, BODY_R = 0.30, BAND_LO = 0.20, BAND_HI = 1.50;
export const SPEED = 1.7, SPRINT = 3.3, REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const M2FT = 3.280839895;
