import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { registerSchema, getAttestationSchemas, checkSchemaExists, importExistingSchema } from '@/utils/schemaUtils';
import { checkKeyOwnership } from '@/utils/lockUtils';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Database } from '@/integrations/supabase/types';
import { 
  Shield, 
  Plus, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Download, 
  Zap, 
  Settings,
  Copy,
  ExternalLink,
  AlertTriangle,
  FileText,
  Database as DatabaseIcon
} from 'lucide-react';

type AttestationSchema = Database['public']['Tables']['attestation_schemas']['Row'];

const Admin: React.FC = () => {
  const { user, authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const ADMIN_LOCK_CHAIN_ID = Number(
    (import.meta as any).env?.VITE_ADMIN_LOCK_CHAIN_ID ||
    (import.meta as any).env?.ADMIN_LOCK_CHAIN_ID ||
    (import.meta as any).env?.VITE_PRIMARY_CHAIN_ID
  ) || 84532;
  const CREATOR_LOCK_CHAIN_ID = Number(
    (import.meta as any).env?.VITE_CREATOR_LOCK_CHAIN_ID ||
    (import.meta as any).env?.CREATOR_LOCK_CHAIN_ID ||
    (import.meta as any).env?.VITE_PRIMARY_CHAIN_ID
  ) || 84532;
  const [schemas, setSchemas] = useState<AttestationSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingSchemas, setCheckingSchemas] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState<Record<number, { exists: boolean; schemaUid?: string; checked: boolean }>>({});
  const [schemaToReplace, setSchemaToReplace] = useState<AttestationSchema | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'attendance',
    schemaDefinition: '',
    revocable: true
  });

  const predefinedSchemas = [
    {
      name: 'TeeRex Event Going v1',
      description: 'Declaration of intent to attend a TeeRex event',
      category: 'attendance',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint256 timestamp, string location, address declarer'
    },
    {
      name: 'TeeRex Event Attended v1',
      description: 'Proof of attendance at a TeeRex event',
      category: 'attendance',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint256 timestamp, string location, address attendee, uint8 verificationMethod'
    },
    {
      name: 'TeeRex Event Review v1',
      description: 'Review and rating for a TeeRex event',
      category: 'review',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint8 rating, string review, uint256 timestamp, string platform'
    },
    {
      name: 'TeeRex Ticket Purchase v1',
      description: 'Proof of ticket purchase on TeeRex',
      category: 'purchase',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint256 tokenId, uint256 price, uint256 timestamp, string platform'
    }
  ];

  useEffect(() => {
    fetchSchemas();
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const accessToken = await getAccessToken?.();
        const { data, error } = await supabase.functions.invoke('is-admin', {
          headers: {
            ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
            ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
          },
        });
        if (error) throw error;
        setIsAdmin(Boolean(data?.is_admin));
      } catch (e) {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [getAccessToken]);

  const checkPredefinedSchemas = async () => {
    if (!wallet) return;
    
    setCheckingSchemas(true);
    try {
      const statusUpdates: Record<number, { exists: boolean; schemaUid?: string; checked: boolean }> = {};
      
      for (let i = 0; i < predefinedSchemas.length; i++) {
        const schema = predefinedSchemas[i];
        const result = await checkSchemaExists(schema.schemaDefinition, wallet);
        statusUpdates[i] = {
          exists: result.exists,
          schemaUid: result.schemaUid,
          checked: true
        };
      }
      
      setSchemaStatus(statusUpdates);
    } catch (error) {
      console.error('Error checking schemas:', error);
    } finally {
      setCheckingSchemas(false);
    }
  };

  useEffect(() => {
    if (wallet && user) {
      checkPredefinedSchemas();
    }
  }, [wallet, user]);

  const fetchSchemas = async () => {
    try {
      const data = await getAttestationSchemas();
      setSchemas(data);
    } catch (error) {
      console.error('Error fetching schemas:', error);
      toast({
        title: "Error",
        description: "Failed to fetch schemas",
        variant: "destructive"
      });
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>
            Please connect your wallet to access the admin panel.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Checking admin access...
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Access denied. You must be an admin (lock manager) to view this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  

  const handleImportSchema = async (index: number) => {
    const schema = predefinedSchemas[index];
    const status = schemaStatus[index];
    
    // Gating: Only admins (holders of ADMIN_LOCK_ADDRESS) can insert into DB
    const ADMIN_LOCK_ADDRESS = (import.meta as any).env?.VITE_ADMIN_LOCK_ADDRESS || (import.meta as any).env?.ADMIN_LOCK_ADDRESS;
    if (ADMIN_LOCK_ADDRESS && wallet?.address) {
      const canInsert = await checkKeyOwnership(ADMIN_LOCK_ADDRESS, wallet.address, ADMIN_LOCK_CHAIN_ID);
      if (!canInsert) {
        toast({
          title: "Insufficient Access",
          description: "You need an admin key to import schemas into the database.",
          variant: "destructive"
        });
        return;
      }
    }
    
    if (!status?.exists || !status.schemaUid) {
      toast({
        title: "Error",
        description: "Schema does not exist on registry",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await importExistingSchema({
        schemaUid: status.schemaUid,
        name: schema.name,
        description: schema.description,
        category: schema.category,
        schemaDefinition: schema.schemaDefinition,
        revocable: true
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Schema imported successfully: ${schema.name}`
        });
        
        // Refresh schemas list
        await fetchSchemas();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error importing schema:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to import schema",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterOrImportPredefined = async (index: number) => {
    const schema = predefinedSchemas[index];
    const status = schemaStatus[index];
    
    if (status?.exists) {
      await handleImportSchema(index);
    } else {
      // Set form data and let user register manually
      setFormData({
        name: schema.name,
        description: schema.description,
        category: schema.category,
        schemaDefinition: schema.schemaDefinition,
        revocable: true
      });
    }
  };

  const handleRegisterPredefinedSchema = async (index: number) => {
    const schema = predefinedSchemas[index];
    
    if (!wallet) {
      toast({
        title: "Error",
        description: "Please connect your wallet to register schemas",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Gating: determine permissions based on Unlock keys
      const ADMIN_LOCK_ADDRESS = (import.meta as any).env?.VITE_ADMIN_LOCK_ADDRESS || (import.meta as any).env?.ADMIN_LOCK_ADDRESS;
      const CREATOR_LOCK_ADDRESS = (import.meta as any).env?.VITE_CREATOR_LOCK_ADDRESS || (import.meta as any).env?.CREATOR_LOCK_ADDRESS;
      let canInsert = true;
      let canRegisterOnChain = true;

      if (ADMIN_LOCK_ADDRESS || CREATOR_LOCK_ADDRESS) {
        canInsert = false;
        canRegisterOnChain = false;
        if (ADMIN_LOCK_ADDRESS) {
          const adminOk = await checkKeyOwnership(ADMIN_LOCK_ADDRESS, wallet.address, ADMIN_LOCK_CHAIN_ID);
          if (adminOk) {
            canInsert = true;
            canRegisterOnChain = true;
          }
        }
        if (!canRegisterOnChain && CREATOR_LOCK_ADDRESS) {
          const creatorOk = await checkKeyOwnership(CREATOR_LOCK_ADDRESS, wallet.address, CREATOR_LOCK_CHAIN_ID);
          if (creatorOk) {
            canRegisterOnChain = true;
          }
        }
      }

      if (!canRegisterOnChain) {
        toast({
          title: "Access Denied",
          description: "You need a valid key in the Creator or Admin lock to register schemas on EAS.",
          variant: "destructive"
        });
        return;
      }

      const result = await registerSchema({
        name: schema.name,
        description: schema.description,
        category: schema.category,
        schemaDefinition: schema.schemaDefinition,
        revocable: true,
        wallet,
        skipDbInsert: !canInsert
      });

      if (result.success) {
        toast({
          title: "Schema Registered",
          description: canInsert 
            ? `Registered and saved: ${result.schemaUid}` 
            : `Registered on EAS only (not saved to DB): ${result.schemaUid}`
        });
        
        // Refresh schemas list and check status again (only if inserted)
        if (canInsert) {
          await fetchSchemas();
        }
        await checkPredefinedSchemas();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error registering schema:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to register schema",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSchema = async () => {
    if (!wallet) {
      toast({
        title: "Error",
        description: "Please connect your wallet to register schemas",
        variant: "destructive"
      });
      return;
    }

    if (!formData.name || !formData.schemaDefinition) {
      toast({
        title: "Error", 
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Gating: determine permissions based on Unlock keys
      const ADMIN_LOCK_ADDRESS = (import.meta as any).env?.VITE_ADMIN_LOCK_ADDRESS || (import.meta as any).env?.ADMIN_LOCK_ADDRESS;
      const CREATOR_LOCK_ADDRESS = (import.meta as any).env?.VITE_CREATOR_LOCK_ADDRESS || (import.meta as any).env?.CREATOR_LOCK_ADDRESS;
      let canInsert = true;
      let canRegisterOnChain = true;

      if (ADMIN_LOCK_ADDRESS || CREATOR_LOCK_ADDRESS) {
        canInsert = false;
        canRegisterOnChain = false;
        if (ADMIN_LOCK_ADDRESS) {
          const adminOk = await checkKeyOwnership(ADMIN_LOCK_ADDRESS, wallet.address, ADMIN_LOCK_CHAIN_ID);
          if (adminOk) {
            canInsert = true;
            canRegisterOnChain = true;
          }
        }
        if (!canRegisterOnChain && CREATOR_LOCK_ADDRESS) {
          const creatorOk = await checkKeyOwnership(CREATOR_LOCK_ADDRESS, wallet.address, CREATOR_LOCK_CHAIN_ID);
          if (creatorOk) {
            canRegisterOnChain = true;
          }
        }
      }

      if (!canRegisterOnChain) {
        toast({
          title: "Access Denied",
          description: "You need a valid key in the Creator or Admin lock to register schemas on EAS.",
          variant: "destructive"
        });
        return;
      }

      const result = await registerSchema({
        name: formData.name,
        description: formData.description,
        category: formData.category,
        schemaDefinition: formData.schemaDefinition,
        revocable: formData.revocable,
        wallet,
        skipDbInsert: !canInsert
      });

      if (result.success) {
        toast({
          title: "Schema Registered",
          description: canInsert 
            ? `Registered and saved: ${result.schemaUid}` 
            : `Registered on EAS only (not saved to DB): ${result.schemaUid}`
        });
        
        // Reset form
        setFormData({
          name: '',
          description: '',
          category: 'attendance',
          schemaDefinition: '',
          revocable: true
        });
        
        // If this was a re-register (Fix Schema UID), delete the old row
        if (canInsert && schemaToReplace?.id) {
          const { error: delError } = await supabase
            .from('attestation_schemas')
            .delete()
            .eq('id', schemaToReplace.id);
          if (delError) {
            console.error('Failed to delete old schema row:', delError);
          }
          setSchemaToReplace(null);
        }
        
        // Refresh schemas list
        if (canInsert) {
          await fetchSchemas();
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error registering schema:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to register schema",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReregisterSchema = async (schema: AttestationSchema) => {
    // Check if user is authenticated and wallet is available
    if (!authenticated || !wallet) {
      console.log('Wallet check failed:', { authenticated, wallet, wallets });
      toast({
        title: "Wallet Connection Required",
        description: authenticated 
          ? "Please ensure your wallet is connected and try again" 
          : "Please connect your wallet first",
        variant: "destructive"
      });
      return;
    }

    // First, populate the form with the schema data
    setFormData({
      name: `TeeRex ${schema.name}`,
      description: schema.description,
      category: schema.category,
      schemaDefinition: schema.schema_definition,
      revocable: schema.revocable
    });
    setSchemaToReplace(schema);

    // Scroll to form and highlight it
    const formElement = document.getElementById('schema-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }

    // Then notify user
    toast({
      title: "Form Populated",
      description: "Schema data has been loaded into the form. Please review and click 'Register Schema' to proceed.",
    });
  };

  const handleUsePredefined = (schema: typeof predefinedSchemas[0]) => {
    setFormData({
      name: schema.name,
      description: schema.description,
      category: schema.category,
      schemaDefinition: schema.schemaDefinition,
      revocable: true
    });
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>
            Please connect your wallet to access the admin panel.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Header Section */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
              <Settings className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Schema Manager
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Create, manage, and deploy attestation schemas on the Ethereum Attestation Service
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Quick Templates Section */}
          <div className="xl:col-span-1">
            <Card className="h-fit border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Zap className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Quick Templates</CardTitle>
                    <CardDescription className="text-sm">Pre-built schemas ready to deploy</CardDescription>
                  </div>
                </div>
                {wallet && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkPredefinedSchemas}
                    disabled={checkingSchemas}
                    className="self-start"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${checkingSchemas ? 'animate-spin' : ''}`} />
                    {checkingSchemas ? 'Checking...' : 'Check Status'}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {predefinedSchemas.map((schema, index) => {
                  const status = schemaStatus[index];
                  const isInOurDb = schemas.some(s => s.schema_definition === schema.schemaDefinition);
                  
                  return (
                    <div key={index} className="group p-4 rounded-xl border bg-card hover:shadow-md transition-all duration-300 hover:border-primary/30">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="font-semibold text-sm mb-1">{schema.name.replace('TeeRex ', '')}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{schema.description}</div>
                        </div>
                        <div className="flex flex-col gap-1 ml-3">
                          {status?.checked && (
                            <Badge variant={status.exists ? "default" : "secondary"} className="text-xs">
                              <div className="flex items-center gap-1">
                                {status.exists ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                {status.exists ? "On EAS" : "Not on EAS"}
                              </div>
                            </Badge>
                          )}
                          {isInOurDb && (
                            <Badge variant="outline" className="text-xs">
                              <DatabaseIcon className="h-3 w-3 mr-1" />
                              Imported
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {status?.exists && !isInOurDb ? (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleImportSchema(index)}
                            disabled={loading || checkingSchemas}
                            className="flex-1 h-8"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            {loading ? 'Importing...' : 'Import'}
                          </Button>
                        ) : !status?.exists && status?.checked && !isInOurDb ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRegisterPredefinedSchema(index)}
                            disabled={loading || checkingSchemas}
                            className="flex-1 h-8"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {loading ? 'Registering...' : 'Register'}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUsePredefined(schema)}
                            disabled={loading || checkingSchemas}
                            className="flex-1 h-8"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Use Template
                          </Button>
                        )}
                      </div>
                      {!status?.checked && wallet && (
                        <div className="mt-2 text-xs text-muted-foreground text-center">
                          Check status to see availability
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Schema Registration Form */}
          <div className="xl:col-span-1">
            <Card id="schema-form" className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <Plus className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Create Schema</CardTitle>
                    <CardDescription className="text-sm">Register new attestation schema</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Schema Name *
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., TeeRex Event Attendance"
                    className="focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What this schema is used for..."
                    rows={3}
                    className="focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-medium">
                    Category
                  </Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                    <SelectTrigger className="focus:ring-2 focus:ring-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attendance">📍 Attendance</SelectItem>
                      <SelectItem value="review">⭐ Review</SelectItem>
                      <SelectItem value="purchase">💰 Purchase</SelectItem>
                      <SelectItem value="identity">👤 Identity</SelectItem>
                      <SelectItem value="other">📋 Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="schema" className="text-sm font-medium">
                    Schema Definition *
                  </Label>
                  <Textarea
                    id="schema"
                    value={formData.schemaDefinition}
                    onChange={(e) => setFormData(prev => ({ ...prev, schemaDefinition: e.target.value }))}
                    placeholder="string eventId, address lockAddress, uint256 timestamp"
                    rows={4}
                    className="font-mono text-sm focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use Solidity types: string, uint256, address, bool, bytes32
                  </p>
                </div>

                <Button 
                  onClick={handleRegisterSchema} 
                  disabled={loading || !wallet}
                  className="w-full h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Register Schema
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Registered Schemas */}
          <div className="xl:col-span-1">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <DatabaseIcon className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Active Schemas</CardTitle>
                    <CardDescription className="text-sm">Currently registered schemas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {schemas.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/20 flex items-center justify-center">
                        <DatabaseIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground text-sm">No schemas registered yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Create your first schema to get started</p>
                    </div>
                  ) : (
                    schemas.map((schema) => {
                      const isValidUID = schema.schema_uid.startsWith('0x') && 
                        schema.schema_uid.length === 66 && 
                        /^0x[0-9a-f]{64}$/i.test(schema.schema_uid);
                      const isInvalidUID = !isValidUID;
                      
                      return (
                        <div key={schema.id} className="group p-4 rounded-xl border bg-card hover:shadow-md transition-all duration-300 hover:border-primary/30">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-sm">{schema.name}</h3>
                                {isInvalidUID && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Invalid UID
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{schema.description}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {schema.category}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Schema UID</span>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <code className="text-xs bg-muted/50 px-2 py-1 rounded font-mono block truncate">
                              {schema.schema_uid}
                            </code>
                          </div>
                          
                          <div className="mt-3">
                            <div className="text-xs text-muted-foreground mb-1">Definition</div>
                            <code className="text-xs bg-muted/50 px-2 py-1 rounded font-mono block break-all">
                              {schema.schema_definition}
                            </code>
                          </div>
                          
                          {isInvalidUID && (
                            <div className="mt-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReregisterSchema(schema)}
                                disabled={loading}
                                className="w-full h-8 border-destructive/20 text-destructive hover:bg-destructive/10"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Fix Schema UID
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
