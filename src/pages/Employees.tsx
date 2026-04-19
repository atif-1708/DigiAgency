import React, { useEffect, useState, useMemo } from 'react';
import { Plus, User, Mail, Hash, Trash2, Edit2, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function Employees() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [performanceRanks, setPerformanceRanks] = useState<Record<string, number>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [stores, setStores] = useState<any[]>([]);

  // Form state
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    identifier: '',
    storeId: ''
  });

  useEffect(() => {
    if (profile?.agency_id || profile?.role === 'super_admin') {
      fetchEmployees();
      fetchStores();
      fetchPerformance();
    } else {
      setLoading(false);
    }
  }, [profile]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;
    const lowerSearch = searchTerm.toLowerCase();
    return employees.filter(emp => 
      (emp.full_name || '').toLowerCase().includes(lowerSearch) ||
      (emp.email || '').toLowerCase().includes(lowerSearch) ||
      (emp.identifier || '').toLowerCase().includes(lowerSearch)
    );
  }, [employees, searchTerm]);

  async function fetchPerformance() {
    if (!profile?.agency_id) return;
    try {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const params = new URLSearchParams({
        agencyId: profile.agency_id,
        startDate: start.toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      });

      const res = await fetch(`/api/performance?${params.toString()}`);
      const result = await res.json();
      if (!result.success) return;

      const campaigns = result.data || [];
      const employeeMap: any = {};
      
      campaigns.forEach((c: any) => {
        const empName = c.buyer_name || 'Unassigned';
        if (!employeeMap[empName]) {
          employeeMap[empName] = { 
            name: empName, 
            confirmed_revenue: 0,
            spend: 0,
            campaign_count: 0
          };
        }
        employeeMap[empName].spend += c.spend || 0;
        employeeMap[empName].campaign_count += 1;
        
        const totalShopifyOrders = (c.shopify_confirmed || 0) + (c.shopify_pending || 0) || 1;
        const confirmedRev = (c.shopify_confirmed || 0) * ((c.shopify_revenue || 0) / totalShopifyOrders);
        employeeMap[empName].confirmed_revenue += confirmedRev;
      });

      const scores = Object.values(employeeMap).map((emp: any) => {
        const confirmedRoas = emp.spend > 0 ? emp.confirmed_revenue / emp.spend : 0;
        const rankScore = (confirmedRoas * 40) + (emp.campaign_count * 5) + ( (emp.confirmed_revenue / 1000) * 0.5 );
        return { name: emp.name, score: rankScore };
      }).sort((a: any, b: any) => b.score - a.score);

      const ranks: Record<string, number> = {};
      scores.forEach((s: any, idx) => {
        ranks[s.name] = idx + 1;
      });
      setPerformanceRanks(ranks);
    } catch (e) {
      console.error('Error fetching performance for ranks:', e);
    }
  }

  async function fetchStores() {
    const { data } = await supabase
      .from('stores')
      .select('id, name')
      .eq('agency_id', profile?.agency_id);
    setStores(data || []);
  }

  async function fetchEmployees() {
    try {
      let query = supabase.from('profiles').select('*');
      
      if (profile?.role === 'employee') {
        // Employees only see themselves
        query = query.eq('id', profile.id);
      } else if (profile?.role !== 'super_admin') {
        query = query.eq('agency_id', profile?.agency_id);
      }

      const { data: profilesData, error: profilesError } = await query;
      if (profilesError) throw profilesError;

      // Fetch all stores for this agency to map names
      const { data: storesData } = await supabase
        .from('stores')
        .select('id, name')
        .eq('agency_id', profile?.agency_id);

      const storesMap = (storesData || []).reduce((acc: any, s) => {
        acc[s.id] = s.name;
        return acc;
      }, {});

      const enrichedEmployees = (profilesData || []).map(emp => ({
        ...emp,
        store_name: emp.store_id ? storesMap[emp.store_id] : 'Unassigned'
      }));

      setEmployees(enrichedEmployees);
    } catch (error: any) {
      toast.error('Failed to fetch team members', { description: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    
    try {
      const endpoint = isEditing ? '/api/admin/update-user' : '/api/admin/create-user';
      const payload: any = {
        email: newMember.email,
        fullName: newMember.name,
        role: newMember.role,
        identifier: newMember.identifier,
        storeId: newMember.storeId
      };

      if (isEditing) {
        payload.userId = selectedMemberId;
        if (newMember.password) payload.password = newMember.password;
      } else {
        payload.password = newMember.password;
        payload.agencyId = profile?.agency_id;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Failed to ${isEditing ? 'update' : 'create'} user`);

        toast.success(isEditing ? 'Member updated successfully!' : 'Member added successfully!', {
          description: `${newMember.name} has been ${isEditing ? 'updated' : 'added to the team'}.`
        });
        
        setIsDialogOpen(false);
        resetForm();
        fetchEmployees();
      } else {
        const text = await response.text();
        throw new Error(`Server returned an unexpected response: ${text.substring(0, 100)}...`);
      }
    } catch (error: any) {
      toast.error(isEditing ? 'Failed to update member' : 'Failed to add member', { description: error.message });
    } finally {
      setIsAdding(false);
    }
  }

  function resetForm() {
    setNewMember({ name: '', email: '', password: '', role: 'employee', identifier: '', storeId: '' });
    setIsEditing(false);
    setSelectedMemberId(null);
  }

  function openEditModal(emp: any) {
    setNewMember({
      name: emp.full_name || '',
      email: emp.email || '',
      password: '', // Don't pre-fill password for editing
      role: emp.role || 'employee',
      identifier: emp.identifier || '',
      storeId: emp.store_id || ''
    });
    setIsEditing(true);
    setSelectedMemberId(emp.id);
    setIsDialogOpen(true);
  }

  async function handleDeleteMember(userId: string) {
    if (!confirm('Are you sure you want to delete this team member? This action cannot be undone.')) return;
    
    setIsDeleting(userId);
    try {
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete member');
      }

      toast.success('Member removed', { description: 'The team member has been successfully deleted.' });
      fetchEmployees();
    } catch (error: any) {
      toast.error('Deletion failed', { description: error.message });
    } finally {
      setIsDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
            <Badge variant="outline" className="h-6 px-2 rounded-full bg-primary/5 text-primary border-primary/20">
              {employees.length} Members
            </Badge>
          </div>
          <p className="text-muted-foreground">Manage employees and their campaign identifiers.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, email or ID..." 
              className="pl-9 bg-card/50 border-muted-foreground/20 focus-visible:ring-primary/20"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {profile?.role !== 'employee' && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger render={<Button className="gap-2" onClick={() => setIsDialogOpen(true)} />}>
              <Plus className="h-4 w-4" />
              Add Member
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{isEditing ? 'Edit Team Member' : 'Add Team Member'}</DialogTitle>
                  <DialogDescription>
                    {isEditing ? "Update member's details and settings." : "Invite a new member to your agency and set their identifier."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      placeholder="John Doe" 
                      value={newMember.name}
                      onChange={e => setNewMember({...newMember, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="john@example.com" 
                      value={newMember.email}
                      onChange={e => setNewMember({...newMember, email: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">{isEditing ? 'New Password (Optional)' : 'Initial Password'}</Label>
                    <Input 
                      id="password" 
                      type="password" 
                      placeholder={isEditing ? 'Leave blank to keep current' : 'Set a password'} 
                      value={newMember.password}
                      onChange={e => setNewMember({...newMember, password: e.target.value})}
                      required={!isEditing}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="role">Role</Label>
                    <Select 
                      value={newMember.role} 
                      onValueChange={val => setNewMember({...newMember, role: val})}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {newMember.role === 'agency_admin' ? 'Agency Admin' : 'Employee'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agency_admin">Agency Admin</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="identifier">Campaign Identifier</Label>
                    <Input 
                      id="identifier" 
                      placeholder="e.g. John" 
                      value={newMember.identifier}
                      onChange={e => setNewMember({...newMember, identifier: e.target.value})}
                      required
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Used to match campaigns (e.g., "John_Summer_Sale")
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="store">Assigned Store</Label>
                    <Select 
                      value={newMember.storeId} 
                      onValueChange={val => setNewMember({...newMember, storeId: val})}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {newMember.storeId ? stores.find(s => s.id === newMember.storeId)?.name : 'Select store'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isAdding}>
                    {isAdding ? 'Saving...' : (isEditing ? 'Update Member' : 'Add Member')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>

      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-muted">
                <TableHead className="w-[80px] pl-6">Rank</TableHead>
                <TableHead className="w-[250px]">Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Identifier</TableHead>
                {profile?.role !== 'employee' && <TableHead className="text-right pr-6">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={profile?.role !== 'employee' ? 6 : 5} className="h-24 text-center text-muted-foreground">
                    {searchTerm ? `No results found for "${searchTerm}"` : 'No team members found.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployees.map((emp) => (
                  <TableRow key={emp.id} className="hover:bg-accent/30 border-muted transition-colors">
                    <TableCell className="pl-6">
                      {emp.role === 'employee' ? (
                        <div className="flex items-center gap-2">
                           <span className={`text-sm font-black ${performanceRanks[emp.full_name] <= 3 ? 'text-primary' : 'opacity-40'}`}>
                             #{performanceRanks[emp.full_name] || '--'}
                           </span>
                        </div>
                      ) : (
                        <span className="text-[10px] uppercase font-bold opacity-20">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {emp.full_name?.[0] || 'U'}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{emp.full_name}</span>
                          <span className="text-xs text-muted-foreground">{emp.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={emp.role === 'agency_admin' ? 'default' : 'secondary'}>
                        {emp.role?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{emp.store_name}</span>
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-bold text-primary">
                        {emp.identifier || 'N/A'}
                      </code>
                    </TableCell>
                    {profile?.role !== 'employee' && (
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(emp)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteMember(emp.id)}
                            disabled={isDeleting === emp.id}
                          >
                            {isDeleting === emp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Naming Convention Guide</CardTitle>
            <CardDescription>How to ensure campaigns are mapped correctly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-2">
              <p className="text-sm font-semibold">Standard Format:</p>
              <code className="block p-2 bg-card rounded border text-sm">
                [Identifier]_[Campaign_Name]_[Date]
              </code>
              <p className="text-xs text-muted-foreground">
                Example: <span className="text-primary font-bold">Ali</span>_Summer_Sale_2024
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              The system automatically scans Meta Ads campaign names for these identifiers. 
              If a match is found, the campaign is linked to the employee for performance tracking.
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Productivity Insights</CardTitle>
            <CardDescription>Campaign launch frequency per employee.</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px]">
            {/* Simple placeholder for a chart */}
            <div className="flex h-full items-end gap-4 px-4">
              {[60, 45, 80, 30].map((height, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div 
                    className="w-full bg-primary/20 rounded-t-lg hover:bg-primary/40 transition-all cursor-pointer" 
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {['Ali', 'Usman', 'Hamza', 'Zain'][i]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
