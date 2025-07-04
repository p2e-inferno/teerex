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
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Database } from '@/integrations/supabase/types';

type AttestationSchema = Database['public']['Tables']['attestation_schemas']['Row'];

const Admin: React.FC = () => {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const [schemas, setSchemas] = useState<AttestationSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingSchemas, setCheckingSchemas] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState<Record<number, { exists: boolean; schemaUid?: string; checked: boolean }>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'attendance',
    schemaDefinition: '',
    revocable: true
  });

  const predefinedSchemas = [
    {
      name: 'TeeRex Event Attendance v1',
      description: 'Proof of attendance at a TeeRex event',
      category: 'attendance',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint256 timestamp, string location, string platform'
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

  const handleImportSchema = async (index: number) => {
    const schema = predefinedSchemas[index];
    const status = schemaStatus[index];
    
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
      const result = await registerSchema({
        name: schema.name,
        description: schema.description,
        category: schema.category,
        schemaDefinition: schema.schemaDefinition,
        revocable: true,
        wallet
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Schema registered with UID: ${result.schemaUid}`
        });
        
        // Refresh schemas list and check status again
        await fetchSchemas();
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
      const result = await registerSchema({
        name: formData.name,
        description: formData.description,
        category: formData.category,
        schemaDefinition: formData.schemaDefinition,
        revocable: formData.revocable,
        wallet
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Schema registered with UID: ${result.schemaUid}`
        });
        
        // Reset form
        setFormData({
          name: '',
          description: '',
          category: 'attendance',
          schemaDefinition: '',
          revocable: true
        });
        
        // Refresh schemas list
        await fetchSchemas();
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
    if (!wallet) {
      toast({
        title: "Error",
        description: "Please connect your wallet to re-register schemas",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await registerSchema({
        name: schema.name,
        description: schema.description,
        category: schema.category,
        schemaDefinition: schema.schema_definition,
        revocable: schema.revocable,
        wallet
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Schema re-registered with new UID: ${result.schemaUid}`
        });
        
        // Update the schema in the database with the new UID
        const { error: updateError } = await supabase
          .from('attestation_schemas')
          .update({ schema_uid: result.schemaUid })
          .eq('id', schema.id);

        if (updateError) {
          console.error('Error updating schema UID:', updateError);
        }
        
        // Refresh schemas list
        await fetchSchemas();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error re-registering schema:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to re-register schema",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-muted-foreground mt-2">
          Manage attestation schemas and app-wide configurations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Schema Registration Form */}
        <Card>
          <CardHeader>
            <CardTitle>Register New Schema</CardTitle>
            <CardDescription>
              Register a new attestation schema on EAS (Ethereum Attestation Service)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Predefined Schemas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Quick Start Templates</Label>
                {wallet && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={checkPredefinedSchemas}
                    disabled={checkingSchemas}
                  >
                    {checkingSchemas ? 'Checking...' : 'Check Status'}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {predefinedSchemas.map((schema, index) => {
                  const status = schemaStatus[index];
                  const isInOurDb = schemas.some(s => s.schema_definition === schema.schemaDefinition);
                  
                  return (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium">{schema.name}</div>
                          <div className="text-xs text-muted-foreground">{schema.description}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {status?.checked && (
                            <Badge variant={status.exists ? "default" : "secondary"} className="text-xs">
                              {status.exists ? "Exists on EAS" : "Not on EAS"}
                            </Badge>
                          )}
                          {isInOurDb && (
                            <Badge variant="outline" className="text-xs">
                              Already imported
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
                            className="flex-1"
                          >
                            {loading ? 'Importing...' : 'Import Schema'}
                          </Button>
                        ) : !status?.exists && status?.checked && !isInOurDb ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRegisterPredefinedSchema(index)}
                            disabled={loading || checkingSchemas}
                            className="flex-1"
                          >
                            {loading ? 'Registering...' : 'Register & Import'}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUsePredefined(schema)}
                            disabled={loading || checkingSchemas}
                            className="flex-1"
                          >
                            Use Template
                          </Button>
                        )}
                        {!status?.checked && wallet && (
                          <Badge variant="secondary" className="text-xs">
                            Click "Check Status" above
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Manual Form */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Schema Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Event Attendance"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description of what this schema is used for"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attendance">Attendance</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="identity">Identity</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="schema">Schema Definition *</Label>
                <Textarea
                  id="schema"
                  value={formData.schemaDefinition}
                  onChange={(e) => setFormData(prev => ({ ...prev, schemaDefinition: e.target.value }))}
                  placeholder="e.g., string eventId, address lockAddress, uint256 timestamp"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Define the schema using Solidity-style types (e.g., string, uint256, address, bool)
                </p>
              </div>

              <Button 
                onClick={handleRegisterSchema} 
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Registering...' : 'Register Schema'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Existing Schemas */}
        <Card>
          <CardHeader>
            <CardTitle>Registered Schemas</CardTitle>
            <CardDescription>
              Schemas currently available in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {schemas.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No schemas registered yet
                </p>
              ) : (
                schemas.map((schema) => {
                  const isValidUID = schema.schema_uid.startsWith('0x') && schema.schema_uid.length === 66;
                  const isPlaceholderUID = schema.schema_uid.match(/^0x[0-9a-f]{64}$/i) && 
                    (schema.schema_uid.includes('1234567890abcdef') || 
                     schema.schema_uid.includes('2234567890abcdef') || 
                     schema.schema_uid.includes('3234567890abcdef'));
                  
                  return (
                    <div key={schema.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium">{schema.name}</h3>
                          <p className="text-sm text-muted-foreground">{schema.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline">{schema.category}</Badge>
                          {isPlaceholderUID && (
                            <Badge variant="destructive" className="text-xs">
                              Invalid UID
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1">Schema UID:</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {schema.schema_uid}
                        </code>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Definition:</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono block">
                          {schema.schema_definition}
                        </code>
                      </div>
                      {isPlaceholderUID && (
                        <div className="mt-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleReregisterSchema(schema)}
                            disabled={loading}
                            className="w-full"
                          >
                            {loading ? 'Re-registering...' : 'Re-register on EAS'}
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
  );
};

export default Admin;
