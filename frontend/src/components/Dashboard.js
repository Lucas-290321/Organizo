import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { differenceInCalendarDays, format, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Badge } from "./ui/badge";
import { Calendar as CalendarIcon, Package, Plus, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../App";
import { Link } from "react-router-dom";
import { getApiUrl } from "../lib/api";
import { compareEventDateTime, parseDateOnly } from "../lib/date";
import { getLowStockLimit } from "../lib/utils";

const API = getApiUrl();
const INVENTORY_CATEGORY_LABELS = {
  Cleaning: "Limpeza",
  Limpeza: "Limpeza",
  Food: "Alimentos",
  Alimentos: "Alimentos",
  "Office Supplies": "Escritório",
  Escritório: "Escritório",
  "EscritÃ³rio": "Escritório",
  "EscritÃƒÂ³rio": "Escritório",
};

const normalizeInventoryCategory = (category) =>
  INVENTORY_CATEGORY_LABELS[category] || category;

const getDaysUntilExpiration = (expirationDate) => {
  if (!expirationDate) return null;

  const today = startOfToday();
  const parsedDate = parseDateOnly(expirationDate);
  if (!parsedDate) return null;

  return differenceInCalendarDays(parsedDate, today);
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [inventoryByCategory, setInventoryByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const refreshTimeoutRef = useRef(null);

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const [statsResponse, inventoryResponse] = await Promise.all([
        axios.get(`${API}/stats/dashboard`),
        axios.get(`${API}/inventory/categories`),
      ]);
      setStats(statsResponse.data);
      setInventoryByCategory(inventoryResponse.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      if (!silent) {
        toast.error("Falha ao carregar os dados do painel");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    const handleRealtimeUpdate = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        fetchDashboardData({ silent: true });
      }, 150);
    };

    window.addEventListener("realtimeUpdate", handleRealtimeUpdate);

    const intervalId = setInterval(() => {
      fetchDashboardData({ silent: true });
    }, 10000);

    return () => {
      window.removeEventListener("realtimeUpdate", handleRealtimeUpdate);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      clearInterval(intervalId);
    };
  }, [fetchDashboardData]);

  const getEventDates = () =>
    stats?.upcoming_events?.map((event) => parseDateOnly(event.date)).filter(Boolean) || [];

  if (loading) {
    return (
      <div className="dashboard-container flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner"></div>
        <span className="ml-2">Carregando painel...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 animate-in fade-in">
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

  <div>
    <h1 className="text-4xl font-bold tracking-tight text-slate-900">
      Bem-vindo, {user?.full_name?.split(" ")[0]}!
    </h1>

    <p className="mt-2 text-slate-500 text-lg">
      Veja o que está acontecendo na sua organização hoje.
    </p>
  </div>

  <div className="flex flex-wrap gap-3">

    <Link to="/agenda">
      <Button
        size="lg"
        className="h-12 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-sm"
      >
        <Plus className="mr-2 h-5 w-5" />
        Adicionar evento
      </Button>
    </Link>

    <Link to="/inventory">
      <Button
        size="lg"
        variant="outline"
        className="h-12 px-6 rounded-xl shadow-sm"
      >
        <Package className="mr-2 h-5 w-5" />
        Adicionar item ao estoque
      </Button>
    </Link>

  </div>

</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <StatCard icon={<CalendarIcon className="w-8 h-8 text-blue-600" />} number={stats?.total_events} label="Total de eventos" />
        <StatCard icon={<Clock className="w-8 h-8 text-orange-600" />} number={stats?.upcoming_events?.length} label="Próximos eventos" />
        <StatCard icon={<Package className="w-8 h-8 text-green-600" />} number={stats?.total_inventory} label="Itens em estoque" />
        <StatCard icon={<AlertTriangle className="w-8 h-8 text-red-600" />} number={stats?.low_inventory?.length} label="Itens com estoque baixo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-6">
        <Card className="overflow-hidden rounded-3xl border-0 shadow-xl">

    <div className="bg-blue-700 py-8 text-center">

        <h2 className="text-3xl font-bold text-white capitalize">
            {format(selectedDate, "MMMM", { locale: ptBR })}
        </h2>

        <p className="text-blue-100">
            {format(selectedDate, "yyyy")}
        </p>

    </div>

    <CardContent className="p-8">

        <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{ hasEvent: getEventDates() }}
            modifiersStyles={{
                hasEvent: {
                    backgroundColor: "#2563eb",
                    color: "#fff",
                    borderRadius: "9999px",
                },
            }}
        />

    </CardContent>

</Card>

        <Card className="shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" /> Próximos eventos
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[420px] flex flex-col justify-start p-6">
            {stats?.upcoming_events?.length > 0 ? (
              <UpcomingEventsList events={stats.upcoming_events} />
            ) : (
              <EmptyState
                icon={<CalendarIcon className="h-10 w-10 text-slate-400" />}
                title="Nenhum evento próximo"
                description="Crie seu primeiro evento para começar"
                actionLabel="Adicionar evento"
                actionLink="/agenda"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <InventoryOverview inventoryByCategory={inventoryByCategory} />
      {stats?.low_inventory?.length > 0 && <LowStockAlert items={stats.low_inventory} />}
    </div>
  );
};

const StatCard = ({ icon, number = 0, label }) => (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6 flex items-center justify-between">

            <div>
                <p className="text-3xl font-bold text-slate-900">
                    {number}
                </p>

                <p className="text-sm text-slate-500 mt-1">
                    {label}
                </p>
            </div>

            <div className="rounded-xl bg-slate-100 p-3">
                {icon}
            </div>

        </CardContent>
    </Card>
);

const UpcomingEventsList = ({ events }) => (
  <div className="space-y-3">
    {[...events].sort(compareEventDateTime).slice(0, 5).map((event) => (
      <div key={event.id} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-medium text-slate-900">{event.event_name}</h4>
          <p className="text-sm text-slate-600 mt-1">{format(parseDateOnly(event.date), "dd/MM")} às {event.time}</p>
          <p className="text-xs text-slate-500 mt-1">{event.requester} - {event.department}</p>
        </div>
        <Badge variant="outline">{event.department}</Badge>
      </div>
    ))}
    <Link to="/agenda">
      <Button variant="outline" className="w-full mt-4">Ver todos os eventos</Button>
    </Link>
  </div>
);

const EmptyState = ({ icon, title, description, actionLabel, actionLink }) => (
  <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">

    <div className="mb-5 rounded-full bg-slate-100 p-4">
      {icon}
    </div>

    <h3 className="text-xl font-semibold text-slate-900">
      {title}
    </h3>

    <p className="mt-2 max-w-sm text-slate-500">
      {description}
    </p>

    <Link to={actionLink}>
      <Button className="mt-6 rounded-xl">
        <Plus className="mr-2 h-4 w-4" />
        {actionLabel}
      </Button>
    </Link>

  </div>
);

const InventoryOverview = ({ inventoryByCategory }) => (
  <Card className="mt-8 rounded-2xl shadow-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Package className="w-5 h-5" />
        Visão geral do estoque
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-6">
        {Object.entries(inventoryByCategory).map(([category, items]) => {
          const categoryLabel = normalizeInventoryCategory(category);

          return (
            <div key={category} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              {/* Cabeçalho da Categoria */}
              <div className="flex justify-between items-center mb-4">
                <div className="text-base font-semibold text-slate-900">
                  {categoryLabel}
                </div>
                <div className="text-sm text-slate-500">
                  Total: {items.length} produto{items.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Linha divisória */}
              <div className="border-t border-slate-200 mb-4"></div>

              {/* Carrossel de Produtos */}
              {items.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    overflowX: 'auto',
                    scrollSnapType: 'x mandatory',
                    paddingBottom: '8px',
                  }}
                  className="pb-2"
                >
                  {items.map((item) => {
                    const daysUntilExp = getDaysUntilExpiration(item.expiration_date);

                    return (
                      <div
                        key={item.id}
                        style={{
                          minWidth: '260px',
                          maxWidth: '260px',
                          flexShrink: 0,
                          scrollSnapAlign: 'start',
                        }}
                        className="slide-up border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors bg-white"
                      >
                        <div className="flex flex-col items-start gap-2 mb-2">
                          <div>
                            <Badge variant="secondary">
                              {categoryLabel}
                            </Badge>
                          </div>
                          <span className="text-sm text-slate-500">{items.length} item(ns)</span>
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{item.product_name}</div>
                          <div className="text-sm text-slate-600 mt-1">
                            Quantidade: {item.quantity} {item.unit_type}
                          </div>
                          {item.expiration_date && (
                            <div className="text-sm text-slate-600 mt-1">
                              Validade: {format(parseDateOnly(item.expiration_date), "dd/MM/yyyy")}
                            </div>
                          )}
                          <div className="text-base font-semibold text-emerald-700 mt-2">R$ {Number(item.price ?? 0).toFixed(2)}</div>
                          {item.quantity <= getLowStockLimit(item.unit_type) && (
                            <div className="mt-2">
                              <Badge variant="destructive">Estoque baixo</Badge>
                            </div>
                          )}
                          {daysUntilExp !== null && daysUntilExp <= 30 && daysUntilExp > 0 && (
                            <div className="mt-2">
                              <Badge variant="destructive">Vence em {daysUntilExp} dias</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum item na categoria {categoryLabel}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Botão Ver Estoque Completo */}
        <Link to="/inventory">
          <Button variant="outline" className="w-full">Ver estoque completo</Button>
        </Link>
      </div>
    </CardContent>
  </Card>
);

const LowStockAlert = ({ items }) => (
  <Card className="mt-8 rounded-2xl border-orange-200 bg-orange-50 shadow-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-orange-800">
        <AlertTriangle className="w-5 h-5" /> Alerta de estoque baixo
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-orange-700 mb-4">Os itens abaixo estão com estoque baixo e podem precisar de reabastecimento:</p>
      <div className="grid gap-2">
        {items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-lg">
            <span className="font-medium">{item.product_name}</span>
            <Badge variant="destructive">Restam {item.quantity} {item.unit_type}</Badge>
          </div>
        ))}
      </div>
      {items.length > 3 && <p className="text-sm text-orange-600 mt-2">E mais {items.length - 3} itens...</p>}
    </CardContent>
  </Card>
);

export default Dashboard;
