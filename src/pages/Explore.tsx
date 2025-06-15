
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Explore = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Explore Events</h1>
          <p className="text-gray-600">Discover amazing Web3 events with blockchain-verified tickets</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Your events will appear here</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Once you create events, they will be displayed on this explore page for others to discover and purchase tickets.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Explore;
