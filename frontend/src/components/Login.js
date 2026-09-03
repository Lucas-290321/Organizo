import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Building2, LogIn, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "", profile_id: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const { login, fetchAccountProfiles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const email = formData.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setAvailableProfiles([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      const profiles = await fetchAccountProfiles(email);
      setAvailableProfiles(profiles);
      setFormData((current) => {
        const profileExists = profiles.some((profile) => profile.id === current.profile_id);
        return profileExists ? current : { ...current, profile_id: "" };
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [formData.email, fetchAccountProfiles]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const success = await login(formData.email, formData.password, formData.profile_id);
      if (success) {
        navigate("/");
      }
    } catch (err) {
      toast.error("Falha no login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <AuthHeader />
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 pb-6 text-center">
            <CardTitle className="text-2xl font-semibold">Entrar</CardTitle>
            <CardDescription>Informe seus dados para acessar sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <InputField id="email" label="E-mail" type="email" value={formData.email} onChange={handleChange} placeholder="Digite seu e-mail" />

              {availableProfiles.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="profile_id">Perfil</Label>
                  <select
                    id="profile_id"
                    name="profile_id"
                    value={formData.profile_id}
                    onChange={handleChange}
                    className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Administrador principal</option>
                    {availableProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name} {profile.department ? `- ${profile.department}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    Perfis criados pelo administrador usam o mesmo e-mail da conta, mas podem ter senha própria.
                  </p>
                </div>
              )}

              <div className="space-y-2 relative">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Digite sua senha"
                  required
                  className="h-12 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-slate-600 hover:text-slate-800"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center" disabled={loading}>
                {loading ? <LoadingIndicator text="Entrando..." /> : <ButtonContent icon={<LogIn className="w-4 h-4" />} text="Entrar" />}
              </Button>
            </form>
            <SignUpLink />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const AuthHeader = () => (
  <div className="text-center mb-8">
    <div className="mx-auto w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mb-4">
      <Building2 className="w-8 h-8 text-white" />
    </div>
    <h1 className="text-2xl font-bold text-slate-900">Organizo</h1>
    <p className="text-slate-600 mt-2">Gestão de agenda e estoque</p>
  </div>
);

const InputField = ({ id, label, type, value, onChange, placeholder }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} name={id} type={type} value={value} onChange={onChange} placeholder={placeholder} required className="h-12" />
  </div>
);

const ButtonContent = ({ icon, text }) => (
  <div className="flex items-center gap-2">{icon}{text}</div>
);

const LoadingIndicator = ({ text }) => (
  <div className="flex items-center gap-2">
    <div className="loading-spinner"></div>
    {text}
  </div>
);

const SignUpLink = () => (
  <div className="mt-6 text-center">
    <p className="text-sm text-slate-600">
      Não tem uma conta?{" "}
      <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">Cadastre-se</Link>
    </p>
  </div>
);

export default Login;
