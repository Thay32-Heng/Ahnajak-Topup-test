import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, X, CheckCircle, XCircle, RefreshCw, Shield, Download, Link2, Gamepad2, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';

interface ZoneOption {
  value: string;
  label: string;
}

interface VerificationConfig {
  id: string;
  game_name: string;
  api_code: string;
  api_provider: string;
  requires_zone: boolean;
  default_zone: string | null;
  zone_options: ZoneOption[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface G2BulkGame {
  id: number;
  code: string;
  name: string;
  image_url: string;
}

// Games that require zone/server ID for verification
const GAMES_REQUIRING_ZONE = [
  'mlbb', 'mlbb_br', 'mlbb_ru', 'mlbb_global', 'mlbb_promo', 'mlbb_special', 'mlbb_exclusive',
  'magic_chest_gogo', 'magic_chess_gogo',
  'hok',
  'freefire', 'freefire_global', 'freefire_vn', 'freefire_id', 'freefire_br', 'freefire_th', 
  'freefire_sg', 'freefire_me', 'freefire_tw', 'freefire_eu', 'freefire_latam', 'freefire_sgmy', 'freefire_bd'
];

const GameVerificationConfigsTab: React.FC = () => {
  const [configs, setConfigs] = useState<VerificationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingGames, setSyncingGames] = useState(false);
  const [games, setGames] = useState<{ id: string; name: string; g2bulk_category_id: string | null }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<VerificationConfig>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newConfig, setNewConfig] = useState({
    game_name: '',
    api_code: '',
    api_provider: 'g2bulk',
    requires_zone: false,
    default_zone: '',
    is_active: true
  });

  const fetchGames = async () => {
    const { data, error } = await db
      .from('games')
      .select('id, name, g2bulk_category_id')
      .order('name', { ascending: true });
    
    if (!error) {
      setGames(data || []);
    }
  };

  const fetchConfigs = async () => {
    setLoading(true);
    const { data, error } = await db
      .from('game_verification_configs')
      .select('*')
      .order('game_name', { ascending: true });

    if (error) {
      toast({ title: 'Failed to load configs', description: error.message, variant: 'destructive' });
    } else {
      const mapped = (data || []).map(d => ({
        ...d,
        zone_options: Array.isArray(d.zone_options) ? d.zone_options as unknown as ZoneOption[] : null,
      }));
      setConfigs(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchConfigs();
    fetchGames();
  }, []);

  const syncFromG2Bulk = async () => {
    setSyncing(true);
    try {
      // Fetch games from G2Bulk API
      const { data, error } = await db.functions.invoke('g2bulk-api', {
        body: { action: 'get_games' }
      });

      if (error) {
        throw new Error(error?.message || 'Failed to fetch games from G2Bulk');
      }

      // The response format is { data: { games: [...] }, success: true }
      // OR directly { games: [...], success: true } depending on endpoint
      const gamesData = data?.data?.games || data?.games || [];
      const games: G2BulkGame[] = gamesData;
      
      if (games.length === 0) {
        toast({ title: 'No games found', description: 'G2Bulk returned no games. Check API configuration.', variant: 'destructive' });
        return;
      }

      // Get existing configs
      const { data: existingConfigs } = await db
        .from('game_verification_configs')
        .select('api_code');
      
      const existingCodes = new Set((existingConfigs || []).map(c => c.api_code));

      // Prepare new configs to insert
      const newConfigs = games
        .filter(game => !existingCodes.has(game.code))
        .map(game => ({
          game_name: game.name,
          api_code: game.code,
          api_provider: 'g2bulk',
          requires_zone: GAMES_REQUIRING_ZONE.some(z => game.code.includes(z) || z.includes(game.code)),
          is_active: true
        }));

      if (newConfigs.length === 0) {
        toast({ title: 'Already synced', description: `All ${games.length} G2Bulk games are already configured` });
        setSyncing(false);
        return;
      }

      // Insert new configs
      const { error: insertError } = await db
        .from('game_verification_configs')
        .insert(newConfigs);

      if (insertError) {
        throw new Error(insertError.message);
      }

      toast({ 
        title: 'Sync complete!', 
        description: `Added ${newConfigs.length} new games. Total: ${games.length} games available.` 
      });
      
      fetchConfigs();
    } catch (error) {
      console.error('Sync error:', error);
      toast({ 
        title: 'Sync failed', 
        description: error instanceof Error ? error.message : 'Unknown error', 
        variant: 'destructive' 
      });
    } finally {
      setSyncing(false);
    }
  };

  // Sync verification configs from actual games in database
  const syncWithGames = async () => {
    setSyncingGames(true);
    try {
      // Get existing configs
      const { data: existingConfigs } = await db
        .from('game_verification_configs')
        .select('game_name');
      
      const existingNames = new Set((existingConfigs || []).map(c => c.game_name.toLowerCase()));

      // Get games that don't have configs
      const gamesToSync = games.filter(g => !existingNames.has(g.name.toLowerCase()) && g.g2bulk_category_id);

      if (gamesToSync.length === 0) {
        toast({ title: 'Already synced', description: 'All games already have verification configs.' });
        setSyncingGames(false);
        return;
      }

      // Create configs for each game
      const newConfigs = gamesToSync.map(game => ({
        game_name: game.name,
        api_code: game.g2bulk_category_id || '',
        api_provider: 'g2bulk',
        requires_zone: GAMES_REQUIRING_ZONE.some(z => 
          (game.g2bulk_category_id || '').includes(z) || z.includes(game.g2bulk_category_id || '')
        ),
        is_active: true
      }));

      const { error: insertError } = await db
        .from('game_verification_configs')
        .insert(newConfigs);

      if (insertError) {
        throw new Error(insertError.message);
      }

      toast({ 
        title: 'Sync complete!', 
        description: `Added ${newConfigs.length} verification configs from your games.` 
      });
      
      fetchConfigs();
    } catch (error) {
      console.error('Sync with games error:', error);
      toast({ 
        title: 'Sync failed', 
        description: error instanceof Error ? error.message : 'Unknown error', 
        variant: 'destructive' 
      });
    } finally {
      setSyncingGames(false);
    }
  };

  const handleAdd = async () => {
    if (!newConfig.game_name || !newConfig.api_code) {
      toast({ title: 'Please fill game name and API code', variant: 'destructive' });
      return;
    }

    const { error } = await db.from('game_verification_configs').insert({
      game_name: newConfig.game_name,
      api_code: newConfig.api_code,
      api_provider: newConfig.api_provider,
      requires_zone: newConfig.requires_zone,
      default_zone: newConfig.default_zone || null,
      is_active: newConfig.is_active
    });

    if (error) {
      toast({ title: 'Failed to add config', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Verification config added!' });
      setNewConfig({
        game_name: '',
        api_code: '',
        api_provider: 'g2bulk',
        requires_zone: false,
        default_zone: '',
        is_active: true
      });
      setShowAddForm(false);
      fetchConfigs();
    }
  };

  const handleStartEdit = (config: VerificationConfig) => {
    setEditingId(config.id);
    setEditData({
      game_name: config.game_name,
      api_code: config.api_code,
      api_provider: config.api_provider,
      requires_zone: config.requires_zone,
      default_zone: config.default_zone || '',
      is_active: config.is_active
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const { error } = await db
      .from('game_verification_configs')
      .update({
        game_name: editData.game_name,
        api_code: editData.api_code,
        api_provider: editData.api_provider,
        requires_zone: editData.requires_zone,
        default_zone: editData.default_zone || null,
        is_active: editData.is_active
      })
      .eq('id', editingId);

    if (error) {
      toast({ title: 'Failed to update config', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Config updated!' });
      setEditingId(null);
      setEditData({});
      fetchConfigs();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await db
      .from('game_verification_configs')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Failed to delete config', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Config deleted!' });
      fetchConfigs();
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await db
      .from('game_verification_configs')
      .update({ is_active: !currentActive })
      .eq('id', id);

    if (error) {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    } else {
      fetchConfigs();
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL verification configs? This cannot be undone.')) {
      return;
    }

    const { error } = await db
      .from('game_verification_configs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) {
      toast({ title: 'Failed to delete configs', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'All configs deleted!' });
      fetchConfigs();
    }
  };

  const [fetchingServersFor, setFetchingServersFor] = useState<string | null>(null);

  const handleFetchServers = async (config: VerificationConfig) => {
    setFetchingServersFor(config.id);
    try {
      const { data, error } = await db.functions.invoke('g2bulk-api', {
        body: { action: 'get_game_servers', game_code: config.api_code }
      });

      if (error) throw new Error(error.message);

      console.log('[FetchServers] raw response:', JSON.stringify(data));

      // Handle multiple G2Bulk response formats
      const serversRaw = data?.data?.servers || data?.servers || data?.data?.zones || data?.zones || data?.data?.regions || data?.regions || null;
      if (!serversRaw) {
        toast({ title: 'Unexpected response', description: `G2Bulk returned no server data for ${config.api_code}. Check the console for details.`, variant: 'destructive' });
        return;
      }

      let zoneOptions: ZoneOption[];

      if (Array.isArray(serversRaw)) {
        // Array format: [{id: "1", name: "Server 1"}, ...] or ["Server 1", "Server 2", ...]
        zoneOptions = serversRaw.map((s: any) => {
          if (typeof s === 'string') return { value: s, label: s };
          return { value: String(s.id || s.value || s.code || s), label: String(s.name || s.label || s) };
        });
      } else if (typeof serversRaw === 'object') {
        // Object format: { "1": "Server 1", "2": "Server 2" }
        zoneOptions = Object.entries(serversRaw).map(([key, val]) => ({
          value: String(key),
          label: String(val),
        }));
      } else {
        toast({ title: 'Unexpected format', description: 'Server data is neither an array nor an object.', variant: 'destructive' });
        return;
      }

      if (zoneOptions.length === 0) {
        toast({ title: 'No servers found', description: `${config.game_name} has no predefined servers.` });
        return;
      }

      // Save to database
      const { error: updateError } = await db
        .from('game_verification_configs')
        .update({ zone_options: zoneOptions as unknown as any })
        .eq('id', config.id);

      if (updateError) throw new Error(updateError.message);

      toast({ title: 'Servers fetched!', description: `${zoneOptions.length} server options saved for ${config.game_name}` });
      fetchConfigs();
    } catch (error) {
      console.error('Fetch servers error:', error);
      toast({ title: 'Failed to fetch servers', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setFetchingServersFor(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-gold/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gold" />
                Game ID Verification Configs
              </CardTitle>
              <CardDescription className="mt-1">
                Manage API mappings for game ID verification using G2Bulk API.
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={fetchConfigs}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={syncFromG2Bulk}
                disabled={syncing}
                className="border-gold/50 text-gold hover:bg-gold/10"
              >
                {syncing ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1" />
                )}
                {syncing ? 'Syncing...' : 'Sync from G2Bulk'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={syncWithGames}
                disabled={syncingGames}
                className="border-green-500/50 text-green-500 hover:bg-green-500/10"
              >
                {syncingGames ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Gamepad2 className="w-4 h-4 mr-1" />
                )}
                {syncingGames ? 'Syncing...' : 'Sync with Games'}
              </Button>
              <Button 
                size="sm" 
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-gold hover:bg-gold-dark text-primary-foreground"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Config
              </Button>
            </div>
          </div>
        </CardHeader>

        {showAddForm && (
          <CardContent className="border-t border-border pt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-sm">Game Name</Label>
                <Input
                  value={newConfig.game_name}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, game_name: e.target.value }))}
                  placeholder="e.g. Mobile Legends"
                  className="border-gold/50 mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">API Code (G2Bulk)</Label>
                <Input
                  value={newConfig.api_code}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, api_code: e.target.value }))}
                  placeholder="e.g. mlbb"
                  className="border-gold/50 mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">API Provider</Label>
                <Select 
                  value={newConfig.api_provider} 
                  onValueChange={(value) => setNewConfig(prev => ({ ...prev, api_provider: value }))}
                >
                  <SelectTrigger className="border-gold/50 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g2bulk">G2Bulk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Default Zone</Label>
                <Input
                  value={newConfig.default_zone}
                  onChange={(e) => setNewConfig(prev => ({ ...prev, default_zone: e.target.value }))}
                  placeholder="Optional"
                  className="border-gold/50 mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={newConfig.requires_zone}
                  onCheckedChange={(checked) => setNewConfig(prev => ({ ...prev, requires_zone: checked }))}
                />
                <Label className="text-sm">Requires Zone/Server ID</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={newConfig.is_active}
                  onCheckedChange={(checked) => setNewConfig(prev => ({ ...prev, is_active: checked }))}
                />
                <Label className="text-sm">Active</Label>
              </div>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} className="bg-gold hover:bg-gold-dark text-primary-foreground">
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-gold/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gold">{configs.length}</div>
            <div className="text-sm text-muted-foreground">Total Configs</div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{configs.filter(c => c.is_active).length}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{configs.filter(c => c.requires_zone).length}</div>
            <div className="text-sm text-muted-foreground">Require Zone</div>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="p-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDeleteAll}
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Configs List */}
      <Card className="border-gold/30">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-3 font-medium">Game Name</th>
                  <th className="p-3 font-medium">API Code</th>
                  <th className="p-3 font-medium">Provider</th>
                  <th className="p-3 font-medium">Zone</th>
                  <th className="p-3 font-medium text-center">Status</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {configs.map((config) => (
                  <tr key={config.id} className="hover:bg-secondary/20">
                    {editingId === config.id ? (
                      <>
                        <td className="p-3">
                          <Input
                            value={editData.game_name || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, game_name: e.target.value }))}
                            className="h-8 border-gold/50"
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            value={editData.api_code || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, api_code: e.target.value }))}
                            className="h-8 border-gold/50"
                          />
                        </td>
                        <td className="p-3">
                          <Select 
                            value={editData.api_provider || 'g2bulk'} 
                            onValueChange={(value) => setEditData(prev => ({ ...prev, api_provider: value }))}
                          >
                            <SelectTrigger className="h-8 border-gold/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="g2bulk">G2Bulk</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={editData.requires_zone || false}
                              onCheckedChange={(checked) => setEditData(prev => ({ ...prev, requires_zone: checked }))}
                            />
                            <Input
                              value={editData.default_zone || ''}
                              onChange={(e) => setEditData(prev => ({ ...prev, default_zone: e.target.value }))}
                              placeholder="Default"
                              className="h-8 w-20 border-gold/50"
                            />
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Switch
                            checked={editData.is_active || false}
                            onCheckedChange={(checked) => setEditData(prev => ({ ...prev, is_active: checked }))}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-gold hover:text-gold-dark"
                              onClick={handleSaveEdit}
                            >
                              <Save className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 font-medium">{config.game_name}</td>
                        <td className="p-3">
                          <code className="text-xs bg-secondary px-2 py-1 rounded">{config.api_code}</code>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {config.api_provider}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {config.requires_zone ? (
                              <Badge variant="secondary" className="text-xs">
                                Required {config.default_zone && `(${config.default_zone})`}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                            {config.zone_options && config.zone_options.length > 0 ? (
                              <Badge variant="outline" className="text-xs text-gold border-gold/50">
                                {config.zone_options.length} servers
                              </Badge>
                            ) : config.requires_zone ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                disabled={fetchingServersFor === config.id}
                                onClick={() => handleFetchServers(config)}
                              >
                                {fetchingServersFor === config.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Server className="w-3 h-3 mr-1" />
                                )}
                                Fetch
                              </Button>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => handleToggleActive(config.id, config.is_active)}>
                            {config.is_active ? (
                              <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="w-5 h-5 text-destructive mx-auto" />
                            )}
                          </button>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Fetch servers from G2Bulk"
                              disabled={fetchingServersFor === config.id}
                              onClick={() => handleFetchServers(config)}
                            >
                              {fetchingServersFor === config.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Server className="w-4 h-4" />
                              )}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => handleStartEdit(config)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(config.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {configs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No verification configs found. Click "Sync from G2Bulk" to import all games.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-gold/30 bg-gold/5">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Sync from G2Bulk:</strong> Import all game codes from G2Bulk API. 
            This will add any new games that don't already exist in your configs. Games like Mobile Legends, Free Fire, and HOK 
            are automatically marked as requiring Zone/Server ID.
            <br /><br />
            <strong>Sync with Games:</strong> Create verification configs for games you've already imported. 
            Uses the g2bulk_category_id from each game as the API code.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default GameVerificationConfigsTab;

