import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, ShieldCheck, History, UserPlus, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../App";
import { getApiUrl } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Checkbox } from "./ui/checkbox";

const API = getApiUrl();

const actionLabels = {
  created: "criou",
  updated: "alterou",
  deleted: "removeu",
};

const entityLabels = {
  inventory: "estoque",
  event: "agenda",
  profile: "perfil",
  account: "conta",
};

const formatDateTime = (value) => {
  if (!value) return "Sem data";
  try {
    return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return value;
  }
};

const AccountPage = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteProfileId, setDeleteProfileId] = useState(null);
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    department: "",
    password: "",
    is_admin: false,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const visibleLogs = useMemo(
    () => auditLogs.filter((log) => log.entity_type === "inventory" || log.entity_type === "event"),
    [auditLogs]
  );

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false);
      return;
    }
    fetchAccountData();
  }, [user?.is_admin]);

  const fetchAccountData = async () => {
    setLoading(true);
    try {
      const [profilesResponse, logsResponse] = await Promise.all([
        axios.get(`${API}/account/profiles`),
        axios.get(`${API}/audit-logs`),
      ]);
      setProfiles(profilesResponse.data?.profiles || []);
      setAuditLogs(logsResponse.data || []);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao carregar os dados da conta");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await axios.post(`${API}/account/profiles`, {
        full_name: formData.full_name.trim(),
        username: formData.username.trim() || null,
        department: formData.department.trim() || null,
        password: formData.password.trim(),
        is_admin: formData.is_admin,
      });
      toast.success(`Perfil ${formData.is_admin ? "administrador" : "interno"} adicionado com sucesso`);
      setFormData({ full_name: "", username: "", department: "", password: "", is_admin: false });
      fetchAccountData();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Falha ao adicionar perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (profileId) => {
    setDeleting(true);
    try {
      await axios.delete(`${API}/account/profiles/${profileId}`);
      toast.success("Perfil deletado com sucesso");
      setDeleteProfileId(null);
      fetchAccountData();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Falha ao deletar perfil");
    } finally {
      setDeleting(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <div className="dashboard-container fade-in">
        <Card>
          <CardContent className="p-6 text-center text-slate-600">
            Somente o perfil administrador pode gerenciar outros perfis e visualizar a trilha completa de auditoria.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando conta...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 animate-in fade-in">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Conta e perfis</h1>
        <p className="mt-2 text-lg text-slate-500">Cadastre perfis internos usando o mesmo e-mail da conta principal e acompanhe quem alterou estoque e agenda.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Novo perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do usuário</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Usuário interno</Label>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Departamento</Label>
                  <Input
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Senha do perfil</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50">
                <Checkbox
                  id="is_admin"
                  checked={formData.is_admin}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_admin: checked })}
                />
                <Label htmlFor="is_admin" className="cursor-pointer flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Criar como administrador
                </Label>
              </div>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 w-full" disabled={saving}>
                {saving ? "Salvando..." : "Adicionar perfil"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Perfis ativos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profiles.length === 0 ? (
              <div className="text-slate-500 text-center py-6">Nenhum perfil cadastrado</div>
            ) : (
              profiles.map((profile) => (
                <div key={profile.id} className="border rounded-lg p-4 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      {profile.full_name}
                      {profile.is_admin && (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                          <ShieldCheck className="w-3 h-3 mr-1" /> Admin
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {profile.username || "Sem usuário interno"} · {profile.department || "Sem departamento"}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      Criado em {formatDateTime(profile.created_at)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteProfileId(profile.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Auditoria de estoque e agenda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleLogs.length === 0 ? (
            <div className="text-slate-500">Nenhuma alteração registrada ainda.</div>
          ) : (
            visibleLogs.map((log) => (
              <div key={log.id} className="border rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline">{entityLabels[log.entity_type] || log.entity_type}</Badge>
                  <Badge>{actionLabels[log.action] || log.action}</Badge>
                </div>
                <div className="font-medium text-slate-900">
                  {log.actor?.full_name || "Usuário"} {actionLabels[log.action] || log.action}{" "}
                  {entityLabels[log.entity_type] || log.entity_type}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {log.snapshot?.product_name || log.snapshot?.event_name || "Registro"} · {formatDateTime(log.occurred_at)}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  Responsável: {log.actor?.full_name || "Não informado"} ({log.actor?.department || "Sem departamento"})
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Alert Dialog para Confirmar Delete */}
      <AlertDialog open={!!deleteProfileId} onOpenChange={(open) => !open && setDeleteProfileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O perfil será permanentemente removido do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProfileId && handleDeleteProfile(deleteProfileId)}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountPage;
