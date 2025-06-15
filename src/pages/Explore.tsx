
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar, MapPin, Users, Search, Filter, Clock, Star, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';

const Explore = () => {
  const [searchQuery, setSearchQuery] = useState('');

  // Mock events data - in a real app, this would come from your backend
  const events = [
    {
      id: 1,
      title: 'Web3 Developer Conference 2024',
      date: 'Dec 15, 2024',
      time: '9:00 AM',
      location: 'San Francisco, CA',
      attendees: 500,
      price: 299,
      category: 'Technology',
      rating: 4.9,
      image: 'bg-gradient-to-br from-purple-500 to-pink-500',
      organizer: 'TechEvents'
    },
    {
      id: 2,
      title: 'NFT Art Gallery Opening',
      date: 'Dec 18, 2024',
      time: '6:00 PM',
      location: 'New York, NY',
      attendees: 200,
      price: 150,
      category: 'Art',
      rating: 4.8,
      image: 'bg-gradient-to-br from-blue-500 to-cyan-500',
      organizer: 'CryptoArt'
    },
    {
      id: 3,
      title: 'DeFi Summit 2024',
      date: 'Dec 20, 2024',
      time: '10:00 AM',
      location: 'Austin, TX',
      attendees: 750,
      price: 399,
      category: 'Finance',
      rating: 4.7,
      image: 'bg-gradient-to-br from-green-500 to-emerald-500',
      organizer: 'DeFiEvents'
    },
    {
      id: 4,
      title: 'Blockchain Gaming Expo',
      date: 'Dec 22, 2024',
      time: '11:00 AM',
      location: 'Los Angeles, CA',
      attendees: 300,
      price: 199,
      category: 'Gaming',
      rating: 4.6,
      image: 'bg-gradient-to-br from-orange-500 to-red-500',
      organizer: 'GameChain'
    },
    {
      id: 5,
      title: 'Crypto Investment Workshop',
      date: 'Dec 25, 2024',
      time: '2:00 PM',
      location: 'Miami, FL',
      attendees: 150,
      price: 99,
      category: 'Education',
      rating: 4.9,
      image: 'bg-gradient-to-br from-indigo-500 to-purple-500',
      organizer: 'CryptoLearn'
    },
    {
      id: 6,
      title: 'Metaverse Architecture Symposium',
      date: 'Dec 28, 2024',
      time: '9:30 AM',
      location: 'Seattle, WA',
      attendees: 400,
      price: 249,
      category: 'Technology',
      rating: 4.8,
      image: 'bg-gradient-to-br from-pink-500 to-rose-500',
      organizer: 'MetaDesign'
    }
  ];

  const categories = ['All', 'Technology', 'Art', 'Finance', 'Gaming', 'Education'];
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         event.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || event.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="pt-12 pb-8 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Discover amazing events
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Find and join Web3 events happening around the world
            </p>
          </div>

          {/* Search and Filters */}
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  type="text"
                  placeholder="Search events, locations, or topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base border-gray-300 rounded-xl"
                />
              </div>
              <Button variant="outline" className="h-12 px-6 border-gray-300 rounded-xl">
                <Filter className="h-5 w-5 mr-2" />
                Filters
              </Button>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 justify-center">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full ${
                    selectedCategory === category
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Events Grid */}
      <section className="py-12">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">
              {filteredEvents.length} events found
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Sort by:</span>
              <Button variant="outline" size="sm" className="border-gray-300 text-gray-700">
                Date
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <Card key={event.id} className="overflow-hidden border-0 shadow-sm hover:shadow-lg transition-shadow duration-300 bg-white group cursor-pointer">
                <div className={`aspect-[4/3] ${event.image} relative`}>
                  <div className="absolute inset-0 bg-black/20"></div>
                  <div className="absolute top-4 left-4">
                    <Badge className="bg-white/20 text-white border-white/30">
                      {event.category}
                    </Badge>
                  </div>
                  <div className="absolute top-4 right-4">
                    <div className="flex items-center gap-1 bg-white/20 text-white px-2 py-1 rounded-full text-sm">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span>{event.rating}</span>
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white text-lg font-semibold mb-2 group-hover:text-white/90 transition-colors">
                      {event.title}
                    </h3>
                    <div className="flex items-center gap-4 text-white/90 text-sm">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{event.date}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{event.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">{event.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users className="w-4 h-4" />
                      <span className="text-sm">{event.attendees}+ going</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">${event.price}</div>
                      <div className="text-sm text-gray-600">by {event.organizer}</div>
                    </div>
                    <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg">
                      <Ticket className="w-4 h-4 mr-2" />
                      Get Ticket
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredEvents.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No events found</h3>
              <p className="text-gray-600 mb-6">Try adjusting your search or filters</p>
              <Button variant="outline" onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Can't find what you're looking for?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Create your own event and bring your community together
          </p>
          <Button 
            size="lg" 
            className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 text-lg font-medium rounded-xl"
            asChild
          >
            <Link to="/create">
              Create Event
              <Plus className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Explore;
