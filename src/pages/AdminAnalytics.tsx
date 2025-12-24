import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  BarChart3,
  Bug,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  RefreshCw
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DebugResult {
  step: string;
  status: 'success' | 'error' | 'warning';
  data?: any;
  message?: string;
  timestamp: string;
}

interface DivviTestResponse {
  success: boolean;
  summary: {
    total_steps: number;
    errors: number;
    warnings: number;
    sdk_source?: string;
    tag_valid?: boolean;
  };
  diagnosis: {
    sdk_loading: string;
    tag_generation: string;
    tag_validation: string;
    recommendation: string;
  };
  results: DebugResult[];
}

const AdminAnalytics: React.FC = () => {
  const { user, getAccessToken } = usePrivy();
  const [isTestingDivvi, setIsTestingDivvi] = useState(false);
  const [testResults, setTestResults] = useState<DivviTestResponse | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (step: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) {
        next.delete(step);
      } else {
        next.add(step);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const runDivviDebugTest = async () => {
    setIsTestingDivvi(true);
    setTestResults(null);

    try {
      // Get user's wallet address for testing (or use a default)
      const testUser = user?.wallet?.address || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const accessToken = await getAccessToken();

      const { data, error } = await supabase.functions.invoke('divvi-debug-test', {
        body: { testUser },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': accessToken ? `Bearer ${accessToken}` : '',
        },
      });

      if (error) {
        console.error('Divvi debug test error:', error);
        toast.error(`Test failed: ${error.message}`);
        return;
      }

      setTestResults(data as DivviTestResponse);

      if (data.success) {
        toast.success('Divvi SDK test passed!');
      } else {
        toast.error('Divvi SDK test failed - check results below');
      }
    } catch (error) {
      console.error('Error running Divvi test:', error);
      toast.error('Failed to run test');
    } finally {
      setIsTestingDivvi(false);
    }
  };

  const getStatusIcon = (status: 'success' | 'error' | 'warning') => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: 'success' | 'error' | 'warning') => {
    const variants = {
      success: 'bg-green-500/10 text-green-700 border-green-500/20',
      error: 'bg-red-500/10 text-red-700 border-red-500/20',
      warning: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    };

    return (
      <Badge variant="outline" className={variants[status]}>
        {getStatusIcon(status)}
        <span className="ml-1 capitalize">{status}</span>
      </Badge>
    );
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>
            Please connect your wallet to access admin analytics.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Header Section */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <BarChart3 className="h-8 w-8 text-orange-600" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Platform Analytics
            </h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Monitor platform performance, diagnostics, and usage statistics
          </p>
        </div>

        {/* Analytics Sections */}
        <div className="space-y-6">
          {/* Divvi Debug Test Section */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <Bug className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Divvi SDK Diagnostics</CardTitle>
                    <CardDescription>
                      Test Divvi referral SDK integration and tag generation
                    </CardDescription>
                  </div>
                </div>
                <Button
                  onClick={runDivviDebugTest}
                  disabled={isTestingDivvi}
                  className="gap-2"
                >
                  {isTestingDivvi ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Run Test
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>

            {testResults && (
              <CardContent>
                {/* Summary Section */}
                <div className="mb-6 p-4 rounded-lg border bg-muted/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {testResults.success ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          Test Passed
                        </>
                      ) : (
                        <>
                          <XCircle className="h-5 w-5 text-red-500" />
                          Test Failed
                        </>
                      )}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(JSON.stringify(testResults, null, 2))}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Full Results
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Total Steps</div>
                      <div className="text-2xl font-bold">{testResults.summary.total_steps}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Errors</div>
                      <div className="text-2xl font-bold text-red-500">
                        {testResults.summary.errors}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Warnings</div>
                      <div className="text-2xl font-bold text-yellow-500">
                        {testResults.summary.warnings}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">SDK Source</div>
                      <div className="text-lg font-semibold">{testResults.summary.sdk_source || 'N/A'}</div>
                    </div>
                  </div>

                  {/* Diagnosis */}
                  <div className="space-y-2 p-3 rounded-md bg-background/50 border">
                    <h4 className="font-semibold text-sm mb-2">Diagnosis</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">SDK Loading:</span>
                        <span className="ml-2 font-mono">{testResults.diagnosis.sdk_loading}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tag Generation:</span>
                        <span className="ml-2 font-mono">{testResults.diagnosis.tag_generation}</span>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-muted-foreground">Tag Validation:</span>
                        <span className={`ml-2 font-mono ${
                          testResults.diagnosis.tag_validation.includes('INVALID')
                            ? 'text-red-500 font-bold'
                            : 'text-green-500'
                        }`}>
                          {testResults.diagnosis.tag_validation}
                        </span>
                      </div>
                    </div>
                    <Alert className={testResults.diagnosis.tag_validation.includes('INVALID') ? 'border-red-500/50 bg-red-500/5' : 'border-green-500/50 bg-green-500/5'}>
                      <AlertDescription className="text-sm">
                        <strong>Recommendation:</strong> {testResults.diagnosis.recommendation}
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>

                {/* Detailed Steps */}
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold mb-3">Detailed Test Steps</h3>
                  {testResults.results.map((result, index) => (
                    <Collapsible
                      key={index}
                      open={expandedSteps.has(result.step)}
                      onOpenChange={() => toggleStep(result.step)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                          <div className="flex items-center gap-3 flex-1">
                            {expandedSteps.has(result.step) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            {getStatusIcon(result.status)}
                            <span className="font-medium">{result.step.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {result.message && (
                              <span className="text-sm text-muted-foreground hidden md:block max-w-md truncate">
                                {result.message}
                              </span>
                            )}
                            {getStatusBadge(result.status)}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-3 pt-2 pb-3">
                        <div className="pl-10 space-y-2">
                          {result.message && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Message:</span>
                              <p className="mt-1 text-foreground">{result.message}</p>
                            </div>
                          )}
                          {result.data && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Data:</span>
                              <pre className="mt-1 p-3 rounded-md bg-muted/50 border overflow-x-auto text-xs font-mono">
                                {JSON.stringify(result.data, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Timestamp: {new Date(result.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Placeholder for future analytics */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Platform Statistics</CardTitle>
              <CardDescription>Coming soon: Event analytics, user metrics, and more</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Additional analytics features will be added here
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
