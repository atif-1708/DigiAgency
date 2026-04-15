import React, { useEffect, useState } from 'react';
import { Plus, Building2, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function Agencies() {
  const [agencies, setAgencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newAgencyName, setNewAgencyName] = useState('');
  
  // Owner form state
  const [selectedAgency, setSelectedAgency] = useState<any>(null);
  const [ownerForm, setOwnerForm] = useState({
    name: '',
    email: '',
    password: ''
  });

  useEffect(() => {
    fetchAgencies();
  }, []);

  async function fetchAgencies() {
    try {
      const { data, error } = await supabase
        .from('agencies')
        .select('*, profiles(count)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgencies(data || []);
    } catch (error: any) {
      toast.error('Failed to fetch agencies', { description: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAgency(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    try {
      const { error } = await supabase
        .from('agencies')
        .insert({ name: newAgencyName });

      if (error) throw error;

      toast.success('Agency created successfully');
      setNewAgencyName('');
      fetchAgencies();
    } catch (error: any) {
      toast.error('Failed to create agency', { description: error.message });
    } finally {
      setIsAdding(false);
    }
  }

  async function handleAddOwner(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ownerForm.email,
          password: ownerForm.password,
          fullName: ownerForm.name,
          role: 'agency_admin',
          agencyId: selectedAgency.id
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create owner');

      toast.success('Agency Owner added successfully');
      setOwnerForm({ name: '', email: '', password: '' });
      setSelectedAgency(null);
      fetchAgencies();
    } catch (error: any) {
      toast.error('Failed to add owner', { description: error.message });
    } finally {
      setIsAdding(false);
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
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Agencies</h1>
          <p className="text-muted-foreground">Manage digital marketing agencies on the platform.</p>
        </div>
        
        <Dialog>
          <DialogTrigger render={<Button className="gap-2" />}>
            <Plus className="h-4 w-4" />
            Create Agency
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleAddAgency}>
              <DialogHeader>
                <DialogTitle>Create New Agency</DialogTitle>
                <DialogDescription>
                  Add a new agency to the AdIntel platform.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Agency Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. Growth Masters" 
                    value={newAgencyName}
                    onChange={e => setNewAgencyName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isAdding}>
                  {isAdding ? 'Creating...' : 'Create Agency'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {agencies.map((agency) => (
          <Card key={agency.id} className="border-none shadow-sm bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                {agency.id.split('-')[0]}
              </Badge>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl">{agency.name}</CardTitle>
              <CardDescription className="mt-1">
                Created on {new Date(agency.created_at).toLocaleDateString()}
              </CardDescription>
              
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Members</span>
                  <span className="font-semibold">{agency.profiles?.[0]?.count || 0}</span>
                </div>
                
                <div className="flex gap-2 mt-4">
                  <Dialog open={selectedAgency?.id === agency.id} onOpenChange={(open) => !open && setSelectedAgency(null)}>
                    <DialogTrigger render={<Button variant="outline" className="flex-1" onClick={() => setSelectedAgency(agency)} />}>
                      Add Owner
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <form onSubmit={handleAddOwner}>
                        <DialogHeader>
                          <DialogTitle>Add Owner to {agency.name}</DialogTitle>
                          <DialogDescription>
                            Create a new Agency Admin account for this agency.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="owner-name">Full Name</Label>
                            <Input 
                              id="owner-name" 
                              placeholder="Agency Owner Name" 
                              value={ownerForm.name}
                              onChange={e => setOwnerForm({...ownerForm, name: e.target.value})}
                              required
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="owner-email">Email Address</Label>
                            <Input 
                              id="owner-email" 
                              type="email" 
                              placeholder="owner@agency.com" 
                              value={ownerForm.email}
                              onChange={e => setOwnerForm({...ownerForm, email: e.target.value})}
                              required
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="owner-password">Initial Password</Label>
                            <Input 
                              id="owner-password" 
                              type="password" 
                              placeholder="Set a password" 
                              value={ownerForm.password}
                              onChange={e => setOwnerForm({...ownerForm, password: e.target.value})}
                              required
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={isAdding}>
                            {isAdding ? 'Adding...' : 'Create Owner'}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon" className="shrink-0">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
