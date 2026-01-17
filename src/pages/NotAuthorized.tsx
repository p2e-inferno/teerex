import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface NotAuthorizedProps {
  details?: React.ReactNode;
}

const NotAuthorized: React.FC<NotAuthorizedProps> = ({ details }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/20">
      <Card className="max-w-md w-full border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 w-min">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle>Not Authorized</CardTitle>
          <CardDescription>
            {details || 'You are not authorized to access this page.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="outline">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Return Home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotAuthorized;

