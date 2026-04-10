// Auto-generates a colored avatar from the project name
// Colors are deterministic — same name always gets same color

const PALETTES = [
  { bg: "#131218", text: "#B2FF59" },  // dark + lime (brand)
  { bg: "#1a1a2e", text: "#B2FF59" },  // navy + lime
  { bg: "#0f2027", text: "#B2FF59" },  // deep teal + lime
  { bg: "#2d1b69", text: "#B2FF59" },  // purple + lime
  { bg: "#1a0a00", text: "#B2FF59" },  // dark brown + lime
  { bg: "#001a0a", text: "#B2FF59" },  // dark green + lime
  { bg: "#1a0a1a", text: "#B2FF59" },  // dark plum + lime
  { bg: "#0a1a1a", text: "#B2FF59" },  // dark cyan + lime
];

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % PALETTES.length;
}

type Props = {
  name: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
};

export function ProjectAvatar({ name, size = "md" }: Props) {
  const palette = PALETTES[getColorIndex(name)];
  const initials = getInitials(name);

  return (
    <div
      className={`${sizes[size]} rounded-xl flex items-center justify-center font-bold shrink-0`}
      style={{ backgroundColor: palette.bg, color: palette.text }}
    >
      {initials}
    </div>
  );
}
