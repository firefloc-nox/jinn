import {
  Home,
  MessageSquare,
  Users,
  Clock,
  LayoutGrid,
  Activity,
  Zap,
  Settings,
  History,
  Brain,
  BookOpen,
  GitBranch,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Optional visual group — used to render a separator before the first item of a new group */
  group?: string
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/org", label: "Organization", icon: Users },
  { href: "/kanban", label: "Kanban", icon: LayoutGrid },
  { href: "/cron", label: "Cron", icon: Clock },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/logs", label: "Activity", icon: Activity },
  { href: "/skills", label: "Skills", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
  // Hermes section
  { href: "/hermes/sessions", label: "H · Sessions", icon: History, group: "hermes" },
  { href: "/hermes/memory", label: "H · Memory", icon: Brain, group: "hermes" },
  { href: "/hermes/skills", label: "H · Skills", icon: BookOpen, group: "hermes" },
]
