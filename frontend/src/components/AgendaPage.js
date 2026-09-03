import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "../App";
import { Calendar } from "./ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import {
  Calendar as CalendarIcon,
  Plus,
  Edit,
  Trash2,
  Search,
  Download,
  Filter,
  Clock,
  User,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { getApiUrl } from "../lib/api";
import { compareEventDateTime, parseDateOnly } from "../lib/date";

const API = getApiUrl();

const formatDateTime = (value) => {
  if (!value) return "Sem registro";
  try {
    return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm");
  } catch {
    return value;
  }
};

const AgendaPage = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [viewMode, setViewMode] = useState("month");

  const [eventForm, setEventForm] = useState({
    event_name: "",
    date: "",
    time: "",
    requester: "",
    department: "",
    notes: "",
  });

  const fetchEvents = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      console.log("🔄 Buscando eventos do servidor...");
      const response = await axios.get(`${API}/events`);
      console.log("✅ Eventos atualizados:", response.data.length, "eventos");
      setEvents(response.data);
    } catch (error) {
      console.error("❌ Erro ao buscar eventos:", error);
      if (!silent) {
        toast.error("Falha ao carregar eventos");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const filterEvents = useCallback(() => {
    let filtered = [...events];
    const now = new Date();

    if (searchTerm) {
      filtered = filtered.filter((event) =>
        (event.event_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.requester || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.department || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.notes || "").toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    filtered = filtered.filter((event) => {
      const date = parseDateOnly(event.date);
      if (!date) return false;
      return (
        date.getFullYear() > now.getFullYear() ||
        (date.getFullYear() === now.getFullYear() && date.getMonth() >= now.getMonth())
      );
    });

    if (viewMode === "month" && selectedDate) {
      const month = selectedDate.getMonth();
      const year = selectedDate.getFullYear();
      filtered = filtered.filter((event) => {
        const date = parseDateOnly(event.date);
        return date && date.getMonth() === month && date.getFullYear() === year;
      });
    }

    setFilteredEvents(filtered);
  }, [events, searchTerm, selectedDate, viewMode]);

  useEffect(() => {
    fetchEvents();

    const handleRealtimeUpdate = (event) => {
      const detail = event.detail;
      if (!detail?.type?.includes("event")) return;

      if (detail.type === "event_created" && detail.payload) {
        setEvents((prev) => {
          if (prev.some((item) => item.id === detail.payload.id)) return prev;
          return [detail.payload, ...prev];
        });
        return;
      }

      if (detail.type === "event_updated" && detail.payload) {
        setEvents((prev) =>
          prev.map((item) => (item.id === detail.payload.id ? detail.payload : item))
        );
        return;
      }

      if (detail.type === "event_deleted" && detail.payload?.id) {
        setEvents((prev) => prev.filter((item) => item.id !== detail.payload.id));
      }
    };

    window.addEventListener("realtimeUpdate", handleRealtimeUpdate);
    return () => window.removeEventListener("realtimeUpdate", handleRealtimeUpdate);
  }, [fetchEvents]);

  useEffect(() => {
    filterEvents();
  }, [filterEvents]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchEvents({ silent: true });
    }, 10000);

    return () => clearInterval(intervalId);
  }, [fetchEvents]);

  const resetForm = () => {
    setEventForm({
      event_name: "",
      date: "",
      time: "",
      requester: "",
      department: "",
      notes: "",
    });
    setSelectedEvent(null);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      console.log("📅 Criando novo evento...");
      await axios.post(`${API}/events`, eventForm);
      toast.success("Evento criado com sucesso");
      setShowEventDialog(false);
      resetForm();
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchEvents();
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error("Falha ao criar evento");
    }
  };

  const handleUpdateEvent = async (e) => {
    e.preventDefault();
    if (!selectedEvent) return;
    try {
      console.log("✏️ Atualizando evento:", selectedEvent.id);
      await axios.put(`${API}/events/${selectedEvent.id}`, eventForm);
      toast.success("Evento atualizado com sucesso");
      setShowEditDialog(false);
      resetForm();
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchEvents();
    } catch (error) {
      console.error("Failed to update event:", error);
      toast.error("Falha ao atualizar evento");
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este evento?")) return;
    try {
      console.log("🗑️ Excluindo evento:", id);
      await axios.delete(`${API}/events/${id}`);
      toast.success("Evento excluído com sucesso");
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchEvents();
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error("Falha ao excluir evento");
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await axios.get(`${API}/export/events/csv`, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "eventos.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Eventos exportados com sucesso");
    } catch (error) {
      console.error("Failed to export events:", error);
      toast.error("Falha ao exportar eventos");
    }
  };

  const openEditDialog = (event) => {
    setSelectedEvent(event);
    setEventForm({
      event_name: event.event_name,
      date: event.date,
      time: event.time,
      requester: event.requester,
      department: event.department,
      notes: event.notes || "",
    });
    setShowEditDialog(true);
  };

  const getEventDates = () => events.map((event) => parseDateOnly(event.date)).filter(Boolean);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 animate-in fade-in">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Gestão da agenda</h1>
        <p className="mt-2 text-lg text-slate-500">Gerencie e acompanhe todos os eventos e compromissos da organização</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-8">
        <div className="flex-1 max-w-3xl relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Buscar eventos, solicitante, departamento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={viewMode === "month" ? "default" : "outline"} onClick={() => setViewMode("month")} className="h-12">
            <CalendarIcon className="w-4 h-4 mr-2" /> Mês
          </Button>
          <Button variant={viewMode === "list" ? "default" : "outline"} onClick={() => setViewMode("list")} className="h-12">
            <Filter className="w-4 h-4 mr-2" /> Lista
          </Button>
          {user?.is_admin && (
            <Button onClick={handleExportCSV} variant="outline" className="h-12">
              <Download className="w-4 h-4 mr-2" /> Exportar
            </Button>
          )}
          <Button className="bg-blue-600 hover:bg-blue-700 h-12" onClick={() => setShowEventDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Adicionar evento
          </Button>
        </div>
      </div>

      {viewMode === "month" ? (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card className="overflow-hidden rounded-2xl shadow-md">

  <div className="bg-blue-700 py-8 text-center">
    <h2 className="text-3xl font-bold text-white capitalize">
      {format(selectedDate, "MMMM", { locale: ptBR })}
    </h2>

    <p className="text-blue-100">
      {format(selectedDate, "yyyy")}
    </p>
  </div>

  <CardContent className="p-6">
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
            <Card className="mt-6 rounded-2xl shadow-sm">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">{filteredEvents.length}</div>
                <div className="text-sm text-slate-600">Eventos neste mês</div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" /> Eventos de {format(selectedDate, "MMMM yyyy", { locale: ptBR })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredEvents.length > 0 ? (
                  [...filteredEvents].sort(compareEventDateTime).map((event) => (
                    <EventCard key={event.id} event={event} onEdit={openEditDialog} onDelete={handleDeleteEvent} user={user} />
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-500">Nenhum evento encontrado</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="w-5 h-5" />Todos os eventos ({filteredEvents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredEvents.length > 0 ? (
              [...filteredEvents].sort(compareEventDateTime).map((event) => (
                <EventCard key={event.id} event={event} onEdit={openEditDialog} onDelete={handleDeleteEvent} user={user} />
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">Nenhum evento encontrado</div>
            )}
          </CardContent>
        </Card>
      )}

      {showEventDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Criar novo evento</h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <Input placeholder="Nome do evento" value={eventForm.event_name} onChange={(e) => setEventForm({ ...eventForm, event_name: e.target.value })} required />
              <Input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} required />
              <Input type="time" value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} required />
              <Input placeholder="Solicitante" value={eventForm.requester} onChange={(e) => setEventForm({ ...eventForm, requester: e.target.value })} />
              <Input placeholder="Departamento" value={eventForm.department} onChange={(e) => setEventForm({ ...eventForm, department: e.target.value })} />
              <Textarea placeholder="Observações" value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowEventDialog(false)}>Cancelar</Button>
                <Button type="submit">Criar</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Editar evento</h2>
            <form onSubmit={handleUpdateEvent} className="space-y-4">
              <Input placeholder="Nome do evento" value={eventForm.event_name} onChange={(e) => setEventForm({ ...eventForm, event_name: e.target.value })} required />
              <Input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} required />
              <Input type="time" value={eventForm.time} onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })} required />
              <Input placeholder="Solicitante" value={eventForm.requester} onChange={(e) => setEventForm({ ...eventForm, requester: e.target.value })} />
              <Input placeholder="Departamento" value={eventForm.department} onChange={(e) => setEventForm({ ...eventForm, department: e.target.value })} />
              <Textarea placeholder="Observações" value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
                <Button type="submit">Atualizar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgendaPage;

const EventCard = ({ event, onEdit, onDelete, user }) => (
  <div className="border rounded-lg p-4 hover:bg-slate-50 transition-colors mb-4">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <h3 className="font-semibold text-slate-900 mb-2">{event.event_name}</h3>
        <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
          <div className="flex items-center gap-1"><CalendarIcon className="w-4 h-4" />{format(parseDateOnly(event.date), "dd/MM/yyyy")}</div>
          <div className="flex items-center gap-1"><Clock className="w-4 h-4" />{event.time}</div>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-600 mb-3">
          <div className="flex items-center gap-1"><User className="w-4 h-4" />{event.requester || "Sem solicitante"}</div>
          <div className="flex items-center gap-1"><Building2 className="w-4 h-4" />{event.department || "Sem departamento"}</div>
        </div>
        {event.notes && <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">{event.notes}</p>}
        <div className="text-xs text-slate-500 mt-3 pt-3 border-t space-y-1">
          {user?.is_admin ? (
            <>
              <div>Criado por: {event.created_by?.full_name || "Não informado"}</div>
              <div>Última alteração: {event.updated_by?.full_name || "Não informado"}</div>
            </>
          ) : null}
          <div>Data e hora: {formatDateTime(event.updated_at || event.created_at)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Badge variant="outline">{event.department || "Agenda"}</Badge>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => onEdit(event)}><Edit className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => onDelete(event.id)} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  </div>
);
