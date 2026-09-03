import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, Camera, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../App";
import { getApiUrl } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const API = getApiUrl();

const PerfilPage = () => {
  const { user, refreshUser } = useAuth();
  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || "",
    date_of_birth: "",
    department: user?.department || "",
    email: user?.email || "",
    phone_number: "",
    profile_picture: null,
  });
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    // Carregar dados do perfil atual se houver
    // Aqui você pode buscar dados do backend se necessário
    setProfileData({
      full_name: user?.full_name || "",
      date_of_birth: user?.date_of_birth || "",
      department: user?.department || "",
      email: user?.email || "",
      phone_number: user?.phone_number || "",
      profile_picture: null,
    });
    setProfilePictureUrl(user?.profile_picture || null);

    if (user?.is_admin) {
      fetchAllProfiles();
    }
  }, [user]);

  const fetchAllProfiles = async () => {
    try {
      const response = await axios.get(`${API}/account/profiles`);
      setAllProfiles(response.data?.profiles || []);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao carregar perfis");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileData({ ...profileData, profile_picture: file });
      const reader = new FileReader();
      reader.onload = (event) => {
        setProfilePictureUrl(event.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileData({ ...profileData, profile_picture: file });
      const reader = new FileReader();
      reader.onload = (event) => {
        setProfilePictureUrl(event.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await axios.put(`${API}/user/profile`, {
        full_name: profileData.full_name.trim(),
        department: profileData.department.trim() || null,
        date_of_birth: profileData.date_of_birth || null,
        phone_number: profileData.phone_number.trim() || null,
        profile_picture: profilePictureUrl || null,
      });
      toast.success("Dados do perfil atualizados com sucesso");
      await refreshUser();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || "Falha ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 animate-in fade-in">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Meu Perfil</h1>
        <p className="mt-2 text-lg text-slate-500">Gerencie seus dados pessoais e foto de perfil.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Card de Foto e Informações Pessoais */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" /> Informações Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-6">
                {/* Foto de Perfil */}
                <div className="space-y-3">
                  <Label>Foto de Perfil</Label>
                  <div className="flex items-center gap-6">
                    {/* Foto Atual */}
                    <div className="w-32 h-32 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-2 border-slate-200">
                      {profilePictureUrl ? (
                        <img src={profilePictureUrl} alt="Perfil" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-16 h-16 text-slate-400" />
                      )}
                    </div>

                    {/* Botões de Upload */}
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Carregar arquivo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Tirar foto
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleCameraCapture}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                {/* Dados Pessoais */}
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome completo</Label>
                      <Input
                        value={profileData.full_name}
                        onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de nascimento</Label>
                      <Input
                        type="date"
                        value={profileData.date_of_birth}
                        onChange={(e) => setProfileData({ ...profileData, date_of_birth: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Cargo</Label>
                      <Input
                        value={profileData.department}
                        onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        value={profileData.email}
                        disabled
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Número de telefone</Label>
                    <Input
                      type="tel"
                      value={profileData.phone_number}
                      onChange={(e) => setProfileData({ ...profileData, phone_number: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>

                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 w-full" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Card de Visualização Pessoal */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" /> Meus Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-base font-semibold text-slate-900">{user?.full_name}</div>
                <div className="text-sm text-slate-600 mt-1">{user?.email}</div>
                <div className="text-sm text-slate-600">{user?.department}</div>
                <div className="mt-3">
                  <Badge variant={user?.is_admin ? "default" : "outline"}>
                    {user?.is_admin ? "Administrador" : "Perfil interno"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Seção de Perfis (apenas para ADMs) */}
      {user?.is_admin && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Prévia de Perfis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allProfiles.length === 0 ? (
              <div className="text-slate-500 text-center py-6">Nenhum perfil configurado</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {allProfiles.map((profile) => (
                  <div key={profile.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-slate-400" />
                      </div>
                      <Badge variant={profile.role === "admin" ? "default" : "outline"}>
                        {profile.role === "admin" ? "Admin" : "Perfil"}
                      </Badge>
                    </div>
                    <div className="font-medium text-slate-900">{profile.full_name}</div>
                    <div className="text-sm text-slate-600 mt-1">{profile.department || "Sem departamento"}</div>
                    <div className="text-xs text-slate-500 mt-2">{profile.username || "Sem usuário"}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PerfilPage;
