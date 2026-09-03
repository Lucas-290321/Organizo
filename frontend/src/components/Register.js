import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Building2, UserPlus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const Register = () => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    department: ""
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const departments = [
    "Administration","Human Resources","Finance","IT","Operations",
    "Marketing","Sales","Customer Service","Facilities","Other"
  ];

  const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  try {
    const success = await register(formData);
    if (success) navigate("/login");
  } catch (err) {
    toast.error(err.message || "Unknown error");
  } finally {
    setLoading(false);
  }
};


  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleDepartmentChange = (value) => setFormData({ ...formData, department: value });

  return (
    <AuthPageLayout
      title="Organizo"
      subtitle="Crie sua conta"
      icon={<Building2 className="w-8 h-8 text-white" />}
    >
      <Card className="shadow-xl border-0">
        <CardHeader className="space-y-1 pb-6">
          <CardTitle className="text-2xl font-semibold text-center">Cadastrar</CardTitle>
          <CardDescription className="text-center text-slate-600">
            Crie uma conta para começar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Nome completo" name="full_name" value={formData.full_name} onChange={handleChange} />
            <FormField label="Usuário" name="username" value={formData.username} onChange={handleChange} />
            <FormField label="E-mail" name="email" type="email" value={formData.email} onChange={handleChange} />
            

            <div className="space-y-2">
              <Label htmlFor="department">Departamento</Label>
              <Select value={formData.department} onValueChange={handleDepartmentChange} required>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Selecione seu departamento" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Campo de senha com toggle */}
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
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-slate-600 hover:text-slate-800"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="loading-spinner"></div>
                  Criando conta...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Criar conta
                </div>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              Já tem uma conta?{" "}
              <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
                Entrar
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </AuthPageLayout>
  );
};

// Layout component to reuse for login/register pages
const AuthPageLayout = ({ title, subtitle, icon, children }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="mx-auto w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mb-4">
          {icon}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-600 mt-2">{subtitle}</p>
      </div>
      {children}
    </div>
  </div>
);

// Reusable input field
const FormField = ({ label, name, type = "text", value, onChange }) => (
  <div className="space-y-2">
    <Label htmlFor={name}>{label}</Label>
    <Input
      id={name}
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={`Digite ${label.toLowerCase()}`}
      required
      className="h-11"
    />
  </div>
);

export default Register;
