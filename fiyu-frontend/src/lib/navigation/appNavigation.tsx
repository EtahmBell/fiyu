import type { ComponentType, SVGProps } from "react";

type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavigationId = "picks" | "lists" | "log" | "map" | "profile";

export interface NavigationItem {
  id: NavigationId;
  label: string;
  accessibleLabel: string;
  href: string;
  icon: NavigationIcon;
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function PicksIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m12 2 1.35 4.15L17.5 7.5l-4.15 1.35L12 13l-1.35-4.15L6.5 7.5l4.15-1.35L12 2Z" />
      <path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
      <path d="m5 14 .65 1.85 1.85.65-1.85.65L5 19l-.65-1.85-1.85-.65 1.85-.65L5 14Z" />
    </svg>
  );
}

function ListsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M6 4h13v5H6zM6 15h13v5H6z" />
      <path d="M2.5 6.5h.01M2.5 17.5h.01" />
    </svg>
  );
}

function LogIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path data-log-plus="true" d="M12 4v16M4 12h16" />
    </svg>
  );
}

function MapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" />
      <path d="M9 3v16M15 5v16" />
    </svg>
  );
}

function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export const APP_NAVIGATION = [
  { id: "picks", label: "Picks", accessibleLabel: "Picks", href: "/", icon: PicksIcon },
  { id: "lists", label: "Lists", accessibleLabel: "Lists", href: "/lists", icon: ListsIcon },
  { id: "log", label: "Log", accessibleLabel: "Log a visit", href: "/log", icon: LogIcon },
  { id: "map", label: "Map", accessibleLabel: "Map", href: "/map", icon: MapIcon },
  {
    id: "profile",
    label: "Profile",
    accessibleLabel: "Profile",
    href: "/profile",
    icon: ProfileIcon,
  },
] as const satisfies readonly NavigationItem[];

export const MOBILE_NAVIGATION_ORDER: readonly NavigationId[] = [
  "picks",
  "lists",
  "log",
  "map",
  "profile",
];

export const DESKTOP_NAVIGATION_ORDER: readonly NavigationId[] = [
  "picks",
  "map",
  "lists",
  "log",
];

export function navigationItem(id: NavigationId): NavigationItem {
  const item = APP_NAVIGATION.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown navigation destination: ${id}`);
  return item;
}

export function navigationIsActive(pathname: string, item: NavigationItem): boolean {
  return item.href === "/"
    ? pathname === "/" || pathname === "/picks"
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
