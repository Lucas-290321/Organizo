import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { differenceInCalendarDays, format, isSameMonth, parseISO, startOfToday } from "date-fns";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Package, Plus, Edit, Trash2, Search, Download, AlertTriangle, DollarSign, Calendar, Package2, ArrowDownLeft } from "lucide-react";
import { toast } from "sonner";
import { getApiUrl } from "../lib/api";
import { parseDateOnly } from "../lib/date";
import { useAuth } from "../App";
import { getLowStockLimit } from "../lib/utils";

const API = getApiUrl();

const categories = [
  { value: "Limpeza", label: "Limpeza", icon: "\uD83E\uDDF9" },
  { value: "Alimentos", label: "Alimentos", icon: "\uD83E\uDD66" },
  { value: "Escrit\u00f3rio", label: "Escrit\u00f3rio", icon: "\uD83E\uDDD1\u200D\uD83D\uDCBB" },
];

const normalizeCategory = (category) => {
  if (!category) return category;

  if (category === "Cleaning" || category === "Limpeza") {
    return "Limpeza";
  }

  if (category === "Food" || category === "Alimentos") {
    return "Alimentos";
  }

  if (category === "Office Supplies" || category.toLowerCase().includes("escrit")) {
    return "Escrit\u00f3rio";
  }

  return category;
};

const normalizeInventoryItem = (item) => ({
  ...item,
  category: normalizeCategory(item.category),
});

const formatDateTime = (value) => {
  if (!value) return "Sem registro";
  try {
    return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm");
  } catch {
    return value;
  }
};

const isCurrentMonthItem = (item) => {
  if (!item.created_at) return false;

  try {
    return isSameMonth(parseISO(item.created_at), new Date());
  } catch {
    return false;
  }
};

const InventoryPage = () => {
  const { user } = useAuth();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [withdrawItem, setWithdrawItem] = useState(null);
  const [withdrawSearchTerm, setWithdrawSearchTerm] = useState("");
  const [withdrawQuantity, setWithdrawQuantity] = useState("");
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [itemForm, setItemForm] = useState({
    product_name: "",
    quantity: "",
    expiration_date: "",
    price: "",
    unit_type: "",
    category: "",
  });

  const fetchInventory = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      console.log("🔄 Buscando estoque do servidor...");
      const response = await axios.get(`${API}/inventory`);
      console.log("✅ Estoque atualizado:", response.data.length, "itens");
      setInventoryItems(response.data.map(normalizeInventoryItem));
    } catch (error) {
      console.error("❌ Erro ao buscar estoque:", error);
      if (!silent) {
        toast.error("Falha ao carregar o estoque");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchInventory();

    const handleRealtimeUpdate = (event) => {
      const detail = event.detail;
      if (!detail?.type?.includes("inventory")) return;

      if (detail.type === "inventory_created" && detail.payload) {
        setInventoryItems((prev) => {
          const createdItem = normalizeInventoryItem(detail.payload);
          if (prev.some((item) => item.id === createdItem.id)) return prev;
          return [createdItem, ...prev];
        });
        return;
      }

      if (detail.type === "inventory_updated" && detail.payload) {
        setInventoryItems((prev) =>
          prev.map((item) =>
            item.id === detail.payload.id ? normalizeInventoryItem(detail.payload) : item
          )
        );
        return;
      }

      if (detail.type === "inventory_deleted" && detail.payload?.id) {
        setInventoryItems((prev) => prev.filter((item) => item.id !== detail.payload.id));
      }
    };

    window.addEventListener("realtimeUpdate", handleRealtimeUpdate);
    return () => window.removeEventListener("realtimeUpdate", handleRealtimeUpdate);
  }, [fetchInventory]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchInventory({ silent: true });
    }, 10000);

    return () => clearInterval(intervalId);
  }, [fetchInventory]);

  const handleCreateItem = async (e) => {
    e.preventDefault();
    try {
      console.log("📝 Criando novo item...");
      await axios.post(`${API}/inventory`, {
        ...itemForm,
        category: normalizeCategory(itemForm.category),
        quantity: parseFloat(itemForm.quantity),
        price: parseFloat(itemForm.price),
      });
      toast.success("Item criado com sucesso");
      setShowItemDialog(false);
      resetForm();
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchInventory();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao criar item");
    }
  };

  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      console.log("✏️ Atualizando item:", selectedItem.id);
      await axios.put(`${API}/inventory/${selectedItem.id}`, {
        ...itemForm,
        category: normalizeCategory(itemForm.category),
        quantity: parseFloat(itemForm.quantity),
        price: parseFloat(itemForm.price),
      });
      toast.success("Item atualizado com sucesso");
      setShowEditDialog(false);
      resetForm();
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchInventory();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao atualizar item");
    }
  };

  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    if (!withdrawItem) {
      toast.error("Selecione um produto para saída");
      return;
    }

    const quantityValue = parseFloat(withdrawQuantity);
    if (!quantityValue || quantityValue <= 0) {
      toast.error("Informe uma quantidade válida para retirada");
      return;
    }

    if (quantityValue > withdrawItem.quantity) {
      toast.error("Quantidade de saída maior que o estoque disponível");
      return;
    }

    try {
      console.log("📤 Registrando saída de estoque:", withdrawItem.id);
      const updatedQuantity = withdrawItem.quantity - quantityValue;
      await axios.put(`${API}/inventory/${withdrawItem.id}`, {
        product_name: withdrawItem.product_name,
        unit_type: withdrawItem.unit_type,
        expiration_date: withdrawItem.expiration_date || "",
        price: withdrawItem.price,
        category: withdrawItem.category,
        quantity: updatedQuantity,
        is_withdrawal: true,
      });
      toast.success("Saída de estoque registrada com sucesso");
      setShowWithdrawDialog(false);
      setWithdrawItem(null);
      setWithdrawQuantity("");
      setWithdrawSearchTerm("");
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchInventory();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao registrar saída de estoque");
    }
  };

  const handleOpenWithdrawDialog = (item = null) => {
    setWithdrawItem(item);
    setWithdrawQuantity("");
    setWithdrawSearchTerm("");
    setShowWithdrawDialog(true);
  };

  const monthlyInventoryAdditions = inventoryItems.filter((item) => isCurrentMonthItem(item));
  const monthlyReportTotals = monthlyInventoryAdditions.reduce(
    (sum, item) => sum + (item.added_value ?? item.price * item.quantity),
    0
  );
  const reportGroups = monthlyInventoryAdditions.reduce((groups, item) => {
    const category = item.category || "Sem categoria";
    if (!groups[category]) groups[category] = [];
    groups[category].push(item);
    return groups;
  }, {});

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm("Tem certeza que deseja excluir este item do estoque?")) return;

    try {
      console.log("🗑️ Excluindo item:", itemId);
      await axios.delete(`${API}/inventory/${itemId}`);
      toast.success("Item excluído com sucesso");
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchInventory();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao excluir item");
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await axios.get(`${API}/export/inventory/csv`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "estoque.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Estoque exportado com sucesso");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao exportar estoque");
    }
  };

  const resetForm = () => {
    setItemForm({
      product_name: "",
      quantity: "",
      expiration_date: "",
      price: "",
      unit_type: "",
      category: "",
    });
    setSelectedItem(null);
  };

  const openEditDialog = (item) => {
    const normalizedItem = normalizeInventoryItem(item);
    setSelectedItem(normalizedItem);
    setItemForm({
      product_name: normalizedItem.product_name,
      quantity: normalizedItem.quantity.toString(),
      expiration_date: normalizedItem.expiration_date || "",
      price: normalizedItem.price.toString(),
      unit_type: normalizedItem.unit_type,
      category: normalizedItem.category,
    });
    setShowEditDialog(true);
  };

  const filteredItems = inventoryItems.filter((item) => {
    const normalizedCategory = normalizeCategory(item.category);
    const matchesCategory = activeCategory === "all" || normalizedCategory === activeCategory;
    const matchesSearch = item.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const lowStockItems = inventoryItems.filter((item) => item.quantity <= getLowStockLimit(item.unit_type));
  const expiringSoonItems = inventoryItems.filter((item) => {
    if (!item.expiration_date) return false;
    const today = startOfToday();
    const expDate = parseDateOnly(item.expiration_date);
    if (!expDate) return false;
    const daysDiff = differenceInCalendarDays(expDate, today);
    return daysDiff >= 0 && daysDiff <= 30;
  });

  const currentMonthTotalValue = inventoryItems.reduce((sum, item) => {
    if (!isCurrentMonthItem(item)) return sum;
    return sum + (item.added_value ?? item.price * item.quantity);
  }, 0);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando estoque...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 animate-in fade-in">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Gestão de Estoque</h1>
        <p className="mt-2 text-lg text-slate-500">Gerencie e acompanhe todos os produtos em estoque.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <Card className="shadow-sm hover:shadow-md transition-shadow rounded-2xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-slate-900">{inventoryItems.length}</p>
              <p className="text-sm text-slate-500 mt-1">Total de itens</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        {user?.is_admin && (
          <Card
            className="shadow-sm hover:shadow-md transition-shadow rounded-2xl cursor-pointer"
            onClick={() => setShowReportDialog(true)}
          >
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-slate-900">R$ {currentMonthTotalValue.toFixed(2)}</p>
                <p className="text-sm text-slate-500 mt-1">Gasto no mês atual</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-3">
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm hover:shadow-md transition-shadow rounded-2xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-slate-900">{lowStockItems.length}</p>
              <p className="text-sm text-slate-500 mt-1">Estoque baixo</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow rounded-2xl">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-slate-900">{expiringSoonItems.length}</p>
              <p className="text-sm text-slate-500 mt-1">Vencendo em breve</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <Calendar className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Buscar itens do estoque..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => handleOpenWithdrawDialog()} variant="outline" className="h-12">
            <ArrowDownLeft className="w-4 h-4 mr-2" /> Saída de estoque
          </Button>
          {user?.is_admin && (
            <Button onClick={handleExportCSV} variant="outline" className="h-12">
              <Download className="w-4 h-4 mr-2" /> Exportar
            </Button>
          )}

          <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 h-12 text-white">
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Adicionar novo item</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateItem} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do produto</Label>
                  <Input
                    value={itemForm.product_name}
                    onChange={(e) => setItemForm({ ...itemForm, product_name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={itemForm.quantity}
                      onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <select
                      value={itemForm.unit_type}
                      onChange={(e) => setItemForm({ ...itemForm, unit_type: e.target.value })}
                      required
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Selecione uma unidade</option>
                      <option value="Litros">Litros</option>
                      <option value="Kg">Kg</option>
                      <option value="Pacote">Pacote</option>
                      <option value="Unidades">Unidades</option>
                      <option value="Caixas">Caixas</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Preço</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={itemForm.price}
                      onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      value={itemForm.category}
                      onValueChange={(value) => setItemForm({ ...itemForm, category: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.icon} {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Data de validade (opcional)</Label>
                  <Input
                    type="date"
                    value={itemForm.expiration_date}
                    onChange={(e) => setItemForm({ ...itemForm, expiration_date: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowItemDialog(false); resetForm(); }}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    Adicionar item
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="rounded-2xl shadow-md">
        <CardContent className="p-6">
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">Todos os itens</TabsTrigger>
              {categories.map((category) => (
                <TabsTrigger key={category.value} value={category.value}>
                  {category.icon} {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="all" className="mt-6">
              <InventoryGrid items={filteredItems} onEdit={openEditDialog} onDelete={handleDeleteItem} onWithdraw={handleOpenWithdrawDialog} showAudit={user?.is_admin} />
            </TabsContent>
            {categories.map((category) => (
              <TabsContent key={category.value} value={category.value} className="mt-6">
                <InventoryGrid items={filteredItems} onEdit={openEditDialog} onDelete={handleDeleteItem} onWithdraw={handleOpenWithdrawDialog} showAudit={user?.is_admin} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar item do estoque</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateItem} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do produto</Label>
              <Input
                value={itemForm.product_name}
                onChange={(e) => setItemForm({ ...itemForm, product_name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <select
                  value={itemForm.unit_type}
                  onChange={(e) => setItemForm({ ...itemForm, unit_type: e.target.value })}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Selecione uma unidade</option>
                  <option value="Litros">Litros</option>
                  <option value="Kg">Kg</option>
                  <option value="Pacote">Pacote</option>
                  <option value="Unidades">Unidades</option>
                  <option value="Caixas">Caixas</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preço</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={itemForm.category}
                  onValueChange={(value) => setItemForm({ ...itemForm, category: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.icon} {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data de validade (opcional)</Label>
              <Input
                type="date"
                value={itemForm.expiration_date}
                onChange={(e) => setItemForm({ ...itemForm, expiration_date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { setShowEditDialog(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                Atualizar item
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Saída de estoque</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWithdrawSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Buscar produto</Label>
              <Input
                placeholder="Digite o nome do produto..."
                value={withdrawSearchTerm}
                onChange={(e) => setWithdrawSearchTerm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Produto selecionado</Label>
              <div className="rounded-lg border border-input bg-background p-4 text-sm text-slate-700">
                {withdrawItem ? (
                  <>
                    <div className="font-semibold">{withdrawItem.product_name}</div>
                    <div>Categoria: {withdrawItem.category}</div>
                    <div>Estoque atual: {withdrawItem.quantity} {withdrawItem.unit_type}</div>
                  </>
                ) : (
                  <span className="text-slate-500">Nenhum produto selecionado. Clique em um item abaixo.</span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantidade retirada</Label>
              <Input
                type="number"
                step="0.01"
                value={withdrawQuantity}
                onChange={(e) => setWithdrawQuantity(e.target.value)}
                placeholder="Quantidade retirada"
                required
              />
            </div>
            <div className="space-y-4">
              <Label>Itens encontrados</Label>
              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-auto">
                {inventoryItems
                  .filter((item) =>
                    item.product_name.toLowerCase().includes(withdrawSearchTerm.toLowerCase())
                  )
                  .slice(0, 8)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setWithdrawItem(item)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        withdrawItem?.id === item.id ? "border-blue-600 bg-blue-50" : "border-input bg-white hover:border-slate-400"
                      }`}
                    >
                      <div className="font-medium">{item.product_name}</div>
                      <div className="text-xs text-slate-500">{item.category} · {item.quantity} {item.unit_type}</div>
                    </button>
                  ))}
                {!inventoryItems.filter((item) =>
                  item.product_name.toLowerCase().includes(withdrawSearchTerm.toLowerCase())
                ).length && (
                  <div className="text-sm text-slate-500">Nenhum produto corresponde à busca.</div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { setShowWithdrawDialog(false); setWithdrawItem(null); setWithdrawQuantity(""); setWithdrawSearchTerm(""); }}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                Registrar saída
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {user?.is_admin && (
        <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
          <DialogContent className="sm:max-w-[640px] max-h-[calc(100vh-120px)] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Relatório de inclusões no estoque</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 h-full overflow-hidden">
              <div className="rounded-xl border border-input bg-slate-50 p-4 sticky top-0 z-10">
                <div className="text-sm text-slate-500">Total de movimentações no mês</div>
                <div className="mt-2 text-2xl font-semibold">R$ {monthlyReportTotals.toFixed(2)}</div>
              </div>
              <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-300px)]">
                {Object.keys(reportGroups).length > 0 ? (
                  Object.entries(reportGroups).map(([category, items]) => (
                    <div key={category} className="rounded-xl border border-input bg-white p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-base font-semibold">{category}</div>
                        <div className="text-sm text-slate-500">{items.length} itens</div>
                      </div>
                      <div className="space-y-3">
                        {items.map((item) => (
                          <div key={item.id} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                            <div className="font-medium">{item.product_name}</div>
                            <div className="text-sm text-slate-600">Quantidade: {item.quantity} {item.unit_type}</div>
                            <div className="text-sm text-slate-600">Valor unitário: R$ {item.price.toFixed(2)}</div>
                            <div className="text-sm text-slate-500">Incluído em: {format(parseISO(item.created_at), "dd/MM/yyyy")}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">Nenhuma inclusão registrada este mês.</div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowReportDialog(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const InventoryGrid = ({ items, onEdit, onDelete, onWithdraw, showAudit }) => {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <Package2 className="empty-state-icon" />
        <h3>Nenhum item encontrado</h3>
      </div>
    );
  }

  return (
    <div className="inventory-grid">
      {items.map((item) => {
        const normalizedItem = normalizeInventoryItem(item);
        const today = startOfToday();
        const expDate = normalizedItem.expiration_date
          ? parseDateOnly(normalizedItem.expiration_date)
          : null;
        const daysUntilExp = expDate
          ? differenceInCalendarDays(expDate, today)
          : null;

        return (
          <Card
            key={normalizedItem.id}
            className="inventory-card shadow-sm hover:shadow-md transition-all rounded-2xl"
          >
            <CardContent className="p-5 flex h-full flex-col gap-5">
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Badge variant="outline" className="px-3 py-1 rounded-full text-sm">
                    {normalizedItem.category}
                  </Badge>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onWithdraw(normalizedItem)}
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(normalizedItem)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(normalizedItem.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-slate-900 leading-snug">
                    {normalizedItem.product_name}
                  </h3>

                  <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <span>Quantidade</span>
                      <span className="font-semibold text-slate-900">
                        {normalizedItem.quantity} {normalizedItem.unit_type}
                      </span>
                    </div>

                    {normalizedItem.expiration_date && (
                      <div className="flex items-center justify-between gap-3">
                        <span>Validade</span>
                        <span className="font-medium text-slate-900">
                          {format(parseDateOnly(normalizedItem.expiration_date), "dd/MM/yyyy")}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <span>Valor</span>
                      <span className="text-base font-semibold text-slate-900">
                        R$ {normalizedItem.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {normalizedItem.quantity <= getLowStockLimit(normalizedItem.unit_type) && (
                    <Badge variant="destructive" className="px-3 py-1 rounded-full text-sm">
                      Estoque baixo
                    </Badge>
                  )}
                  {daysUntilExp !== null && daysUntilExp <= 30 && daysUntilExp > 0 && (
                    <Badge variant="destructive" className="px-3 py-1 rounded-full text-sm">
                      Vence em {daysUntilExp} dias
                    </Badge>
                  )}
                </div>
              </div>

              <div className="border-t pt-4 text-xs text-slate-500">
                {showAudit ? (
                  <div className="space-y-1">
                    <div>
                      Criado por: {normalizedItem.created_by?.full_name || "Não informado"}
                    </div>
                    <div>
                      Última alteração: {normalizedItem.updated_by?.full_name || "Não informado"}
                    </div>
                    <div>
                      Data e hora: {formatDateTime(normalizedItem.updated_at || normalizedItem.created_at)}
                    </div>
                  </div>
                ) : (
                  <div>
                    Data e hora: {formatDateTime(normalizedItem.updated_at || normalizedItem.created_at)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default InventoryPage;
