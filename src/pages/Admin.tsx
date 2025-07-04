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
import { registerSchema, getAttestationSchemas } from '@/utils/schemaUtils';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Database } from '@/integrations/supabase/types';

type AttestationSchema = Database['public']['Tables']['attestation_schemas']['Row'];

const Admin: React.FC = () => {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const [schemas, setSchemas] = useState<AttestationSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'attendance',
    schemaDefinition: '',
    revocable: true
  });

  const predefinedSchemas = [
    {
      name: 'Event Attendance',
      description: 'Proof of attendance at an event',
      category: 'attendance',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint256 timestamp, string location'
    },
    {
      name: 'Event Review',
      description: 'Review and rating for an event',
      category: 'review',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint8 rating, string review, uint256 timestamp'
    },
    {
      name: 'Ticket Purchase',
      description: 'Proof of ticket purchase',
      category: 'purchase',
      schemaDefinition: 'string eventId, address lockAddress, string eventTitle, uint256 tokenId, uint256 price, uint256 timestamp'
    }
  ];

  useEffect(() => {
    fetchSchemas();
  }, []);

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
              <Label className="text-sm font-medium">Quick Start Templates</Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {predefinedSchemas.map((schema, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => handleUsePredefined(schema)}
                    className="justify-start text-left h-auto p-3"
                  >
                    <div>
                      <div className="font-medium">{schema.name}</div>
                      <div className="text-xs text-muted-foreground">{schema.description}</div>
                    </div>
                  </Button>
                ))}
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
                schemas.map((schema) => (
                  <div key={schema.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium">{schema.name}</h3>
                        <p className="text-sm text-muted-foreground">{schema.description}</p>
                      </div>
                      <Badge variant="outline">{schema.category}</Badge>
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
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
