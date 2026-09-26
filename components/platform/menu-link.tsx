import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bell,
  Church,
  CalendarDays,
  CalendarCheck,
  CircleHelp,
  FileText,
  LifeBuoy,
  HandHeart,
  QrCode,
  Settings,
  Shield,
  UserRound,
  Home,
  Search,
  MessageCircle,
  Menu
} from "lucide-react";
import type {
  NavigationIcon,
  NavigationItem
} from "@/lib/platform/navigation-registry";

const icons: Record<NavigationIcon, typeof Church> = {
  home: Home,
  church: Church,
  search: Search,
  messages: MessageCircle,
  menu: Menu,
  book: BookOpen,
  bell: Bell,
  calendar: CalendarDays,
  calendarCheck: CalendarCheck,
  circleHelp: CircleHelp,
  file: FileText,
  help: LifeBuoy,
  handHeart: HandHeart,
  qr: QrCode,
  settings: Settings,
  shield: Shield,
  person: UserRound
};

export function MenuLink({ item }: { item: NavigationItem }) {
  const Icon = icons[item.icon];
  return (
    <li>
      <Link href={item.href} prefetch={item.prefetch} className="gc-menu-link">
        <Icon aria-hidden="true" />
        <span>
          <span className="gc-menu-link-title">{item.title}</span>
          <span className="gc-menu-link-description">{item.description}</span>
        </span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}
