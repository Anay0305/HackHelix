// Hand-authored coordinates for the skill tree constellation.
// Coordinates are in a 0..100 unit space (viewBox). The SVG scales to container.
// "branch" hints a rough visual column for mobile fallback ordering.

export interface NodeLayout {
  x: number;
  y: number;
  branch?: "center" | "left" | "right";
}

export const skillTreeLayout: Record<string, NodeLayout> = {
  // Unit 1 — Foundations (center column)
  greetings:  { x: 50, y: 6,  branch: "center" },
  family:     { x: 50, y: 20, branch: "center" },
  numbers:    { x: 50, y: 34, branch: "center" },

  // Unit 2 — Everyday (branches)
  food:       { x: 28, y: 46, branch: "left" },
  questions:  { x: 50, y: 50, branch: "center" },
  emotions:   { x: 72, y: 46, branch: "right" },

  // Unit 3 — Advanced (rejoin + fan out)
  time:       { x: 50, y: 64, branch: "center" },
  travel:     { x: 28, y: 78, branch: "left" },
  healthcare: { x: 72, y: 78, branch: "right" },
  workplace:  { x: 50, y: 92, branch: "center" },
};

export const SKILL_TREE_VIEWBOX = { w: 100, h: 100 };
