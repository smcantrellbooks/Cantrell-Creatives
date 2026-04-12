import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { MessageSquare, BookOpen, FileText, Image, Volume2, Headphones, Users, Coins, Settings, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const NYXEN_AVATAR = "https://cdn1.site-media.eu/images/0/24185616/nyxen-hucYBsyp6NvKtsJFls-OUg.jpg";

const navItems = [
  { path: "/", icon: MessageSquare, label: "Chat" },
  { path: "/stories", icon: BookOpen, label: "Stories" },
  { path: "/editor", icon: FileText, label: "Editor" },
  { path: "/images", icon: Image, label: "Images" },
  { path: "/voice-studio", icon: Volume2, label: "Voice Studio" },
  { path: "/audiobook", icon: Headphones, label: "Audiobook" },
  { path: "/voices", icon: Users, label: "Voices" },
  { path: "/credits", icon: Coins, label: "Credits" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#fdfcfb]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-white shadow-lg">
                <AvatarImage src={NYXEN_AVATAR} alt="Nyxen" />
                <AvatarFallback className="bg-primary text-primary-foreground font-heading">N</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="font-heading text-xl font-semibold text-foreground">Nyxen</h1>
                <p className="text-xs text-muted-foreground">AI Creative Assistant</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`
                  }
                  data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border/40 bg-white">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
