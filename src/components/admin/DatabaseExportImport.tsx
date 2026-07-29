import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database, CheckCircle, AlertCircle, Loader2, FileJson } from "lucide-react";
import { db } from "@/integrations/db/client";
import api from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface ExportData {
  version: string;
  exportedAt: string;
  games: any[];
  packages: any[];
  specialPackages: any[];
  siteSettings: any[];
  gameVerificationConfigs: any[];
  paymentQrSettings: any[];
  paymentGateways?: any[];
}

const DatabaseExportImport: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      async function safeFetch<T>(name: string, fetch: () => Promise<{ data: T | null; error: any }>): Promise<T[]> {
        try {
          const result = await fetch();
          if (result.error) {
            console.warn(`Export: ${name} failed`, result.error);
            return [];
          }
          return result.data || [];
        } catch (err) {
          console.warn(`Export: ${name} error`, err);
          return [];
        }
      }

      const [games, packages, specialPackages, siteSettings, verificationConfigs, paymentQrSettings, paymentGateways] = await Promise.all([
        safeFetch('games', () => db.from("games").select("*").order("sort_order")),
        safeFetch('packages', () => db.from("packages").select("*").order("sort_order")),
        safeFetch('special_packages', () => db.from("special_packages").select("*").order("sort_order")),
        safeFetch('site_settings', () => db.from("site_settings").select("*")),
        safeFetch('game_verification_configs', () => db.from("game_verification_configs").select("*")),
        safeFetch('payment_qr_settings', () => db.from("payment_qr_settings").select("*")),
        safeFetch('payment_gateways', () => db.from("payment_gateways").select("*")),
      ]);

      const exportData: ExportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        games,
        packages,
        specialPackages,
        siteSettings,
        gameVerificationConfigs: verificationConfigs,
        paymentQrSettings,
        paymentGateways,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `database-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalGames = games.length;
      const totalPackages = packages.length;
      const hasWarnings = !paymentGateways.length;
      toast({
        title: `✅ Export Successful`,
        description: `Exported ${totalGames} games, ${totalPackages} packages` + (hasWarnings ? ' (payment gateways unavailable)' : ''),
      });
    } catch (error: any) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export database",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const data: ExportData = JSON.parse(text);

      // Validate data structure
      if (!data.version || !data.games || !data.packages) {
        throw new Error("Invalid backup file format");
      }

      const result = await api.post('/admin/import-database', data);
      if (result.error) throw new Error(result.error.message || result.error);

      const imported = result.data?.imported || {};
      setImportResult({
        success: true,
        message: `Imported ${imported.games || 0} games, ${imported.packages || 0} packages, ${imported.specialPackages || 0} special packages`,
      });

      toast({
        title: "✅ Import Successful",
        description: `${imported.games || 0} games, ${imported.packages || 0} packages restored. Refresh page.`,
      });

      setTimeout(() => window.location.reload(), 2000);
    } catch (error: any) {
      console.error("Import error:", error);
      setImportResult({
        success: false,
        message: error.message || "Failed to import database",
      });
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import database",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-gold/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-gold" />
            Database Export & Import
          </CardTitle>
          <CardDescription>
            Backup your data before sharing or remixing. Export saves all games, packages, settings, and
            configurations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Export Section */}
          <div className="p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                <Download className="w-6 h-6 text-green-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">Export Database</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Download a JSON backup of all your games, packages, special packages, site settings, and
                  verification configs.
                </p>
                <Button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export to JSON
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Import Section */}
          <div className="p-4 bg-gradient-to-br from-gold/10 to-amber-500/10 border border-gold/30 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center shrink-0">
                <Upload className="w-6 h-6 text-gold" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">Import Database</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Restore data from a JSON backup file.{" "}
                  <span className="text-amber-500 font-medium">
                    ⚠️ This will replace all existing data!
                  </span>
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".json"
                  className="hidden"
                />
                <Button
                  onClick={handleImportClick}
                  disabled={isImporting}
                  variant="outline"
                  className="border-gold/50 hover:bg-gold/10"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Select JSON File
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Import Result */}
            {importResult && (
              <div
                className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                  importResult.success
                    ? "bg-green-500/20 text-green-600 border border-green-500/30"
                    : "bg-red-500/20 text-red-600 border border-red-500/30"
                }`}
              >
                {importResult.success ? (
                  <CheckCircle className="w-5 h-5 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 shrink-0" />
                )}
                <span className="text-sm">{importResult.message}</span>
              </div>
            )}
          </div>

          {/* Data Summary */}
          <div className="p-4 bg-secondary/30 rounded-lg border border-border">
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <FileJson className="w-4 h-4 text-gold" />
              What gets exported/imported:
            </h4>
            <ul className="grid gap-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold"></span>
                Games (name, image, G2Bulk category, sort order)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold"></span>
                Packages (all package details, prices, G2Bulk links)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold"></span>
                Special Packages (promotional packages)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold"></span>
                Site Settings (logo, colors, announcements)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold"></span>
                Game Verification Configs (API settings per game)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold"></span>
                Payment QR Settings (KHQR configuration)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold"></span>
                Payment Gateways (API keys, configs — ⚠️ keep backup file secure)
              </li>
            </ul>
          </div>

          {/* Warning */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              <strong>💡 Note:</strong> User accounts, orders, and API keys are NOT exported for security reasons.
              After importing, you may need to reconfigure your API settings.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DatabaseExportImport;
