import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { Button } from "./ui/button";
import {
  Building2,
  Calendar,
  Package,
  LayoutDashboard,
  LogOut,
  User,
  Bell,
  Settings,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

import { Avatar, AvatarFallback } from "./ui/avatar";

const Navigation = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    {
      path: "/",
      label: "Painel",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      path: "/agenda",
      label: "Agenda",
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      path: "/inventory",
      label: "Estoque",
      icon: <Package className="h-4 w-4" />,
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2"
        >
          <Building2 className="h-10 w-10 text-blue-600" />
          <span className="text-2xl font-bold text-blue-600">
            Organizo
          </span>
        </Link>

        {/* Menu */}
        <nav className="flex items-center gap-2">

          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-all duration-200
                ${
                  location.pathname === item.path
                    ? "bg-slate-100 font-semibold text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="ml-2 h-10 w-10 rounded-full p-0"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-blue-600 text-white font-medium">
                    {getInitials(user?.full_name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-60"
              align="end"
              forceMount
            >
              <div className="p-3">
                <p className="font-semibold text-sm">
                  {user?.full_name}
                </p>

                <p className="truncate text-xs text-slate-500">
                  {user?.email}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {user?.department}
                </p>

                <p className="text-xs text-slate-500">
                  {user?.is_admin
                    ? "Administrador"
                    : "Perfil interno"}
                </p>
              </div>

            <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => navigate("/perfil")}
                className="cursor-pointer"
              >
                <User className="mr-2 h-4 w-4" />
                Perfil
              </DropdownMenuItem>

              <DropdownMenuItem className="cursor-pointer">
                <Bell className="mr-2 h-4 w-4" />
                Notificações
              </DropdownMenuItem>

              {user?.is_admin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => navigate("/account")}
                    className="cursor-pointer"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Conta e perfis
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-red-600 focus:text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </nav>
      </div>
    </header>
  );
};

function getInitials(name) {
  if (!name) return "U";

  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export default Navigation;