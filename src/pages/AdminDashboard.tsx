import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Settings, 
  Shield, 
  Ticket, 
  BarChart3,
  Users,
  Database,
  Zap,
  ExternalLink
} from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { user } = usePrivy();
  const navigate = useNavigate();

  const adminSections = [
    {
      title: "Schemas & Attestations",
      description: "Manage attestation schemas and view attestation data",
      icon: Shield,
      color: "bg-blue-500/10 border-blue-500/20",
      iconColor: "text-blue-600",
      path: "/admin/schemas"
    },
    {
      title: "Tickets & Events", 
      description: "Manage events, grant keys manually, and view analytics",
      icon: Ticket,
      color: "bg-green-500/10 border-green-500/20",
      iconColor: "text-green-600",
      path: "/admin/events"
    },
    {
      title: "Service Account",
      description: "View service account details and transaction history",
      icon: Settings,
      color: "bg-purple-500/10 border-purple-500/20", 
      iconColor: "text-purple-600",
      path: "/admin/service-account"
    },
    {
      title: "Analytics",
      description: "Platform analytics and usage statistics",
      icon: BarChart3,
      color: "bg-orange-500/10 border-orange-500/20",
      iconColor: "text-orange-600",
      path: "/admin/analytics"
    }
  ];

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>
            Please connect your wallet to access the admin dashboard.
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
              <Database className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Manage platform settings, events, attestations, and analytics from one central location
          </p>
        </div>

        {/* Admin Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {adminSections.map((section) => (
            <Card 
              key={section.path}
              className="group cursor-pointer border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              onClick={() => navigate(section.path)}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${section.color}`}>
                    <section.icon className={`h-6 w-6 ${section.iconColor}`} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">
                      {section.title}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {section.description}
                    </CardDescription>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(section.path);
                  }}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Access {section.title}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Stats or Recent Activity could go here */}
        <div className="mt-12 text-center">
          <Card className="max-w-2xl mx-auto border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 justify-center">
                <Users className="h-5 w-5" />
                Platform Overview
              </CardTitle>
              <CardDescription>
                Quick access to platform statistics and health
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">0</div>
                  <div className="text-sm text-muted-foreground">Active Events</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">0</div>
                  <div className="text-sm text-muted-foreground">Total Attestations</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">0</div>
                  <div className="text-sm text-muted-foreground">Tickets Sold</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;