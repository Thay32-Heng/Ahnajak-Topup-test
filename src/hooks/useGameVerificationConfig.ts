import { useState, useEffect } from 'react';
import { db } from '@/integrations/db/client';

export interface ZoneOption {
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
}

interface UseGameVerificationConfigReturn {
  config: VerificationConfig | null;
  isLoading: boolean;
  requiresZone: boolean;
  defaultZone: string | null;
  zoneOptions: ZoneOption[] | null;
}

export const useGameVerificationConfig = (gameName: string | undefined, apiCode?: string): UseGameVerificationConfigReturn => {
  const [config, setConfig] = useState<VerificationConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!gameName) {
      setConfig(null);
      setIsLoading(false);
      return;
    }

    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const { data: allConfigs } = await db
          .from('game_verification_configs')
          .select('*')
          .eq('is_active', true);

        let data = null;
        if (allConfigs && allConfigs.length > 0) {
          const activeRows = allConfigs.filter((c: any) => c.is_active);
          const name = gameName.toLowerCase();

          // Priority 1: Exact game_name match (case-insensitive)
          data = activeRows.find((c: any) => c.game_name.toLowerCase() === name);
          if (data) data = { ...data };

          // Priority 2: game_name contains the search term
          if (!data) {
            data = activeRows.find((c: any) => c.game_name.toLowerCase().includes(name));
            if (data) data = { ...data };
          }

          // Priority 3: search term contains game_name
          if (!data) {
            data = activeRows.find((c: any) => name.includes(c.game_name.toLowerCase()));
            if (data) data = { ...data };
          }

          // Priority 4: api_code matches g2bulkCategoryId
          if (!data && apiCode) {
            data = activeRows.find((c: any) => c.api_code?.toLowerCase() === apiCode.toLowerCase());
            if (data) data = { ...data };
          }

          // Priority 5: api_code contains the search term
          if (!data) {
            data = activeRows.find((c: any) => c.api_code?.toLowerCase().includes(name));
            if (data) data = { ...data };
          }
        }

        const configData = data ? {
          ...data,
          zone_options: Array.isArray(data.zone_options) ? data.zone_options as unknown as ZoneOption[] : null,
        } : null;
        setConfig(configData);
      } catch (error) {
        console.error('Failed to fetch verification config:', error);
        setConfig(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [gameName, apiCode]);

  return {
    config,
    isLoading,
    requiresZone: config?.requires_zone ?? false,
    defaultZone: config?.default_zone ?? null,
    zoneOptions: config?.zone_options ?? null,
  };
};
